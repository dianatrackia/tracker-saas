/**
 * POST /api/collect
 * Main tracking endpoint — receives events from tracker.js
 * and processes them: stores in DB, verifies, and forwards to integrations.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { sendToMeta } from '@/lib/integrations/meta';
import { verifyLeadInAC } from '@/lib/integrations/activecampaign';
import { verifyLeadInMailchimp } from '@/lib/integrations/mailchimp';
import { verifyPurchaseInStripe } from '@/lib/integrations/stripe-verify';
import type { CollectPayload, TrackingEvent } from '@/types';
import { z } from 'zod';

// ── CORS preflight ───────────────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ── Validation schema ────────────────────────────────────────────────────
const collectSchema = z.object({
  tid:      z.string().startsWith('trk_'),
  event:    z.enum(['page_view','scroll_25','scroll_50','scroll_75','scroll_100','lead','purchase']),
  vid:      z.string().min(1),
  sid:      z.string().min(1),
  fp:       z.string().optional(),
  url:      z.string().optional(),
  ref:      z.string().optional(),
  email:    z.string().email().optional(),
  value:    z.number().optional(),
  currency: z.string().length(3).optional(),
  order_id: z.string().optional(),
  props:    z.record(z.unknown()).optional(),
});

// ── Rate limiting via Upstash Redis ─────────────────────────────────────
async function checkRateLimit(ip: string, tid: string): Promise<boolean> {
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const key = `rl:${tid}:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60); // 60s window
    return count <= 100; // max 100 events per minute per IP
  } catch {
    return true; // if Redis is down, allow through
  }
}

// ── Deduplication ────────────────────────────────────────────────────────
async function isDuplicate(eventId: string): Promise<boolean> {
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const key = `dup:${eventId}`;
    const exists = await redis.exists(key);
    if (exists) return true;
    await redis.setex(key, 3600, '1'); // deduplicate for 1 hour
    return false;
  } catch {
    return false; // if Redis is down, allow through
  }
}

// ── Main handler ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CollectPayload;

    // Validate payload
    const parsed = collectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const data = parsed.data;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const userAgent = req.headers.get('user-agent') || '';

    // Rate limiting
    const allowed = await checkRateLimit(ip, data.tid);
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const supabase = createServiceClient();

    // Resolve workspace from tracking_id
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('tracking_id', data.tid)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Invalid tracking ID' }, { status: 404 });
    }

    // Deduplication: skip same event from same visitor in last hour
    const dupKey = `${data.tid}:${data.vid}:${data.event}:${data.url || ''}`;
    const isDup = await isDuplicate(dupKey);
    if (isDup && (data.event === 'page_view')) {
      // Allow scroll and conversion events through always
      return NextResponse.json({ ok: true, deduped: true });
    }

    // Upsert visitor
    await supabase.from('visitors').upsert(
      {
        workspace_id: workspace.id,
        visitor_id: data.vid,
        fingerprint: data.fp || null,
        ip,
        user_agent: userAgent,
        last_seen: new Date().toISOString(),
        email: data.email || null,
      },
      { onConflict: 'workspace_id,visitor_id', ignoreDuplicates: false }
    );

    // Store the event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        workspace_id: workspace.id,
        visitor_id: data.vid,
        session_id: data.sid,
        event_name: data.event,
        url: data.url || null,
        referrer: data.ref || null,
        ip,
        user_agent: userAgent,
        properties: data.props || {},
        email: data.email || null,
        value: data.value || null,
        currency: data.currency || 'USD',
        order_id: data.order_id || null,
      })
      .select()
      .single();

    if (eventError || !event) {
      console.error('[collect] DB error:', eventError);
      return NextResponse.json({ error: 'Failed to store event' }, { status: 500 });
    }

    // Process integrations asynchronously (fire-and-forget)
    processIntegrations(event as TrackingEvent, workspace.id, supabase).catch(console.error);

    return NextResponse.json({ ok: true, id: event.id });
  } catch (err) {
    console.error('[collect] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Integration processor ─────────────────────────────────────────────────
async function processIntegrations(
  event: TrackingEvent,
  workspaceId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  // Load active integrations for this workspace
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('enabled', true);

  if (!integrations?.length) return;

  for (const integration of integrations) {
    // Decrypt config
    let config: Record<string, string>;
    try {
      config = JSON.parse(decrypt(integration.config.encrypted));
    } catch {
      continue; // skip if can't decrypt
    }

    let result: { success: boolean; response?: unknown; error?: string } = { success: true };
    let verified = false;
    let verifiedBy: string | null = null;

    // ── Meta CAPI ──────────────────────────────────────────────────────
    if (integration.type === 'meta') {
      result = await sendToMeta(event, config as { pixel_id: string; access_token: string });
    }

    // ── ActiveCampaign (verify lead) ───────────────────────────────────
    if (integration.type === 'activecampaign' && event.event_name === 'lead' && event.email) {
      const res = await verifyLeadInAC(event.email, config as { api_url: string; api_key: string });
      verified = res.verified;
      verifiedBy = 'activecampaign';
      result = { success: !res.error, error: res.error };
    }

    // ── Mailchimp (verify lead) ────────────────────────────────────────
    if (integration.type === 'mailchimp' && event.event_name === 'lead' && event.email) {
      const res = await verifyLeadInMailchimp(event.email, config as { api_key: string; list_id: string });
      verified = res.verified;
      verifiedBy = 'mailchimp';
      result = { success: !res.error, error: res.error };
    }

    // ── Stripe (verify purchase) ───────────────────────────────────────
    if (integration.type === 'stripe' && event.event_name === 'purchase' && event.order_id) {
      const res = await verifyPurchaseInStripe(
        event.order_id,
        config as { secret_key: string; webhook_secret: string }
      );
      verified = res.verified;
      verifiedBy = 'stripe';
      result = { success: !res.error, error: res.error };
    }

    // Log the forward attempt
    await supabase.from('event_forwards').insert({
      event_id: event.id,
      integration: integration.type,
      status: result.success ? 'success' : 'error',
      response: result.response || null,
      error_msg: result.error || null,
    });

    // Update event verification status if applicable
    if (verified) {
      await supabase
        .from('events')
        .update({ verified: true, verified_by: verifiedBy })
        .eq('id', event.id);
    }
  }
}
