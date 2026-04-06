/**
 * POST /api/collect
 * Main tracking endpoint — receives events from tracker.js
 * and processes them: stores in DB, verifies, and forwards to integrations.
 */
import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createServiceClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { sendToMeta } from '@/lib/integrations/meta';
import { verifyLeadInAC } from '@/lib/integrations/activecampaign';
import { verifyLeadInMailchimp } from '@/lib/integrations/mailchimp';
import { verifyPurchaseInStripe } from '@/lib/integrations/stripe-verify';
import type { CollectPayload, TrackingEvent } from '@/types';
import { z } from 'zod';

// ── CORS preflight ───────────────────────────────────────────────────────
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  // Use * for null origins (file:// local pages) so local test pages work
  const allowOrigin = (!origin || origin === 'null') ? '*' : origin;
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ── Validation schema ────────────────────────────────────────────────────
const collectSchema = z.object({
  tid:      z.string().startsWith('trk_'),
  event:    z.enum(['page_view','scroll_25','scroll_50','scroll_75','scroll_100','lead','purchase']).or(z.string()),
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

    // ── Server-side attribution enrichment ──────────────────────────────────
    // If this event arrives without utm_campaign, look up the visitor's last
    // known UTM touch within the 30-day attribution window.
    // Covers: Safari ITP clearing localStorage, incognito mode, direct return visits.
    // Strategy 1 — same visitor_id (same cookie = same browser)
    // Strategy 2 — same fingerprint (same device, different cookie e.g. incognito)
    const rawUtms = (data.props?.utms || {}) as Record<string, string>;
    const hasUtmCampaign = !!rawUtms.utm_campaign;
    let enrichedProps: Record<string, unknown> = { ...(data.props || {}) };

    if (!hasUtmCampaign) {
      const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Strategy 1: same visitor_id
      const { data: prevEvents } = await supabase
        .from('events')
        .select('properties')
        .eq('workspace_id', workspace.id)
        .eq('visitor_id', data.vid)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: false })
        .limit(10);

      const prevWithUtm = prevEvents?.find(e => {
        const u = (e.properties as Record<string, unknown>)?.utms as Record<string, string>;
        return u?.utm_campaign;
      });

      if (prevWithUtm) {
        const p = prevWithUtm.properties as Record<string, unknown>;
        enrichedProps = {
          ...enrichedProps,
          source: p.source || enrichedProps.source,
          medium: p.medium || enrichedProps.medium,
          utms: p.utms,
          attribution_method: 'carried_forward',
        };
      } else if (data.fp) {
        // Strategy 2: same fingerprint, different visitor_id (incognito / cleared cookies)
        const { data: fpVisitors } = await supabase
          .from('visitors')
          .select('visitor_id')
          .eq('workspace_id', workspace.id)
          .eq('fingerprint', data.fp)
          .neq('visitor_id', data.vid)
          .limit(5);

        if (fpVisitors?.length) {
          const vids = fpVisitors.map((v: { visitor_id: string }) => v.visitor_id);
          const { data: fpPrevEvents } = await supabase
            .from('events')
            .select('properties')
            .eq('workspace_id', workspace.id)
            .in('visitor_id', vids)
            .gte('created_at', windowStart)
            .order('created_at', { ascending: false })
            .limit(10);

          const fpWithUtm = fpPrevEvents?.find(e => {
            const u = (e.properties as Record<string, unknown>)?.utms as Record<string, string>;
            return u?.utm_campaign;
          });

          if (fpWithUtm) {
            const p = fpWithUtm.properties as Record<string, unknown>;
            enrichedProps = {
              ...enrichedProps,
              source: p.source || enrichedProps.source,
              medium: p.medium || enrichedProps.medium,
              utms: p.utms,
              attribution_method: 'fingerprint_carried_forward',
            };
          }
        }
      }
    }
    // ── End attribution enrichment ───────────────────────────────────────────

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
        properties: enrichedProps,
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

    // Process integrations asynchronously — waitUntil keeps the Vercel runtime alive
    // until the background task completes (prevents premature termination after HTTP response)
    waitUntil(processIntegrations(event as TrackingEvent, workspace.id, supabase));

    // ── Server-side first-party cookie (bypasses Safari ITP 7-day cap) ──────
    // When the request arrives via the customer's CNAME subdomain (e.g. track.theirdomain.com),
    // we set a cookie scoped to their root domain (.theirdomain.com) via Set-Cookie header.
    // Cookies set by the SERVER are NOT subject to ITP's script-writeable cookie cap.
    const responseBody = NextResponse.json({ ok: true, id: event.id });

    // Always set CORS so file:// pages and any origin can read the response
    const reqOrigin = req.headers.get('origin');
    const allowOrigin = (!reqOrigin || reqOrigin === 'null') ? '*' : reqOrigin;
    responseBody.headers.set('Access-Control-Allow-Origin', allowOrigin);
    responseBody.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    responseBody.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    const requestHost = req.headers.get('host') || '';
    const mainAppHost = (process.env.NEXT_PUBLIC_APP_URL || '')
      .replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Only set server-side cookies when request comes from a custom domain
    const isCustomDomain =
      requestHost &&
      mainAppHost &&
      !requestHost.includes('localhost') &&
      requestHost !== mainAppHost &&
      !requestHost.endsWith('.vercel.app');

    if (isCustomDomain) {
      // Extract root domain: track.example.com → .example.com
      const hostWithoutPort = requestHost.split(':')[0];
      const parts = hostWithoutPort.split('.');
      const rootDomain = parts.length >= 2
        ? '.' + parts.slice(-2).join('.')
        : null;

      if (rootDomain) {
        // Visitor ID cookie — NOT httpOnly so tracker.js can still read it
        const existingVid = req.cookies.get('__fpt')?.value;
        const visitorCookieVal = existingVid || data.vid;
        responseBody.cookies.set('__fpt', visitorCookieVal, {
          domain: rootDomain,
          path: '/',
          maxAge: 365 * 24 * 60 * 60,  // 1 year
          sameSite: 'lax',
          secure: true,
          httpOnly: false,              // needs to be readable by tracker.js
        });

        // Server-set _fbc / _fbp (bypasses Safari ITP 7-day JS cookie limit — WalkerOS pattern)
        // Cookies written via Set-Cookie header are treated as server-set and are NOT capped by ITP.
        const FBC_RE = /^fb\.1\.\d{10,16}\.[A-Za-z0-9_\-]{1,200}$/;
        const FBP_RE = /^fb\.1\.\d+\.\d+$/;
        const rawFbc = (data.props?.fbc as string) || null;
        const rawFbp = (data.props?.fbp as string) || null;
        if (rawFbc && FBC_RE.test(rawFbc)) {
          responseBody.cookies.set('_fbc', rawFbc, {
            domain: rootDomain,
            path: '/',
            maxAge: 90 * 24 * 60 * 60,   // 90 days (Meta standard)
            sameSite: 'lax',
            secure: true,
            httpOnly: false,              // readable by Meta pixel if present
          });
        }
        if (rawFbp && FBP_RE.test(rawFbp)) {
          responseBody.cookies.set('_fbp', rawFbp, {
            domain: rootDomain,
            path: '/',
            maxAge: 90 * 24 * 60 * 60,
            sameSite: 'lax',
            secure: true,
            httpOnly: false,
          });
        }

        // Also set CORS header so the JS beacon can read the response
        responseBody.headers.set('Access-Control-Allow-Origin', `https://${hostWithoutPort}`);
        responseBody.headers.set('Access-Control-Allow-Credentials', 'true');
      }
    }

    return responseBody;
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
  console.log('[integrations] start — workspace:', workspaceId, '| event:', event.id, '| type:', event.event_name);

  // Load active integrations for this workspace
  const { data: integrations, error: intErr } = await supabase
    .from('integrations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('enabled', true);

  console.log('[integrations] found:', integrations?.length ?? 0, intErr ? `| error: ${intErr.message}` : '');

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

    console.log(`[integrations] processing type=${integration.type} for event=${event.event_name}`);

    // ── Meta CAPI ──────────────────────────────────────────────────────
    if (integration.type === 'meta') {
      result = await sendToMeta(event, config as { pixel_id: string; access_token: string });
      console.log(`[integrations] meta result: success=${result.success}`, result.error ?? '');
    }

    // ── ActiveCampaign (verify lead) ───────────────────────────────────
    if (integration.type === 'activecampaign' && event.event_name === 'lead' && event.email) {
      const res = await verifyLeadInAC(event.email, config as { api_url: string; api_key: string });
      verified = res.verified;
      verifiedBy = 'activecampaign';
      result = { success: !res.error, error: res.error };
      console.log(`[integrations] AC result: verified=${res.verified}`, res.error ?? '');
    }

    // ── Mailchimp (verify lead) ────────────────────────────────────────
    if (integration.type === 'mailchimp' && event.event_name === 'lead' && event.email) {
      const res = await verifyLeadInMailchimp(event.email, config as { api_key: string; list_id: string });
      verified = res.verified;
      verifiedBy = 'mailchimp';
      result = { success: !res.error, error: res.error };
      console.log(`[integrations] Mailchimp result: verified=${res.verified}`, res.error ?? '');
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
      console.log(`[integrations] Stripe result: verified=${res.verified}`, res.error ?? '');
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
