/**
 * GET  /api/integrations  — List integrations for current user's workspace
 * POST /api/integrations  — Save/update an integration config
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';
import { z } from 'zod';

const saveSchema = z.object({
  workspace_id: z.string().uuid(),
  type: z.enum(['meta', 'activecampaign', 'mailchimp', 'stripe']),
  config: z.record(z.string()),
  enabled: z.boolean().optional().default(true),
});

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from('integrations')
    .select('id, workspace_id, type, enabled, config, last_tested, created_at, updated_at')
    .order('type');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Decrypt config just enough to expose safe display fields (never raw keys)
  const sanitized = (data || []).map(row => {
    let displayName: string | null = null;
    let connectionMethod: string = 'api_key';
    try {
      const cfg = JSON.parse(decrypt(row.config.encrypted)) as Record<string, string>;
      displayName     = cfg.display_name || null;
      connectionMethod = cfg.connection_method || 'api_key';
    } catch { /* skip */ }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { config: _config, ...rest } = row;
    return { ...rest, display_name: displayName, connection_method: connectionMethod };
  });

  return NextResponse.json({ integrations: sanitized });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { workspace_id, type, config, enabled } = parsed.data;

  // Verify user owns this workspace
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspace_id)
    .single();

  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  // Encrypt sensitive config
  const encryptedConfig = { encrypted: encrypt(JSON.stringify(config)) };

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from('integrations')
    .upsert(
      { workspace_id, type, config: encryptedConfig, enabled },
      { onConflict: 'workspace_id,type' }
    )
    .select('id, type, enabled')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ integration: data });
}

// Test an integration connection
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { integration_id } = await req.json();

  const serviceClient = createServiceClient();
  const { data: integration, error } = await serviceClient
    .from('integrations')
    .select('*')
    .eq('id', integration_id)
    .single();

  if (error || !integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  // Decrypt config
  let config: Record<string, string>;
  try {
    config = JSON.parse(decrypt(integration.config.encrypted));
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt config' }, { status: 500 });
  }

  let result: { success: boolean; error?: string; listName?: string; accountName?: string; pixelName?: string };

  if (integration.type === 'activecampaign') {
    const { testACConnection } = await import('@/lib/integrations/activecampaign');
    result = await testACConnection(config as { api_url: string; api_key: string });
  } else if (integration.type === 'mailchimp') {
    const { testMailchimpConnection } = await import('@/lib/integrations/mailchimp');
    // Supports both OAuth (access_token+dc) and API key configs
    result = await testMailchimpConnection(config as { api_key?: string; list_id?: string; access_token?: string; dc?: string });
  } else if (integration.type === 'stripe') {
    const { testStripeConnection } = await import('@/lib/integrations/stripe-verify');
    // Supports both OAuth (access_token) and API key (secret_key) configs
    result = await testStripeConnection(config as { secret_key?: string; access_token?: string; webhook_secret?: string });
  } else if (integration.type === 'meta') {
    // Test Meta by sending a minimal synthetic event to the CAPI endpoint.
    // Tokens generated from Events Manager have read_ads_dataset_quality scope,
    // which is CAPI-only — they cannot read pixel info via GET /{pixel_id}.
    // Sending to /events is the correct verification for this token type.
    const axios = (await import('axios')).default;
    try {
      const payload: Record<string, unknown> = {
        data: [{
          event_name: 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          event_id: `test_conn_${Date.now()}`,
          action_source: 'website',
          user_data: { client_ip_address: '127.0.0.1', client_user_agent: 'TrackerSaaS/test' },
        }],
        access_token: config.access_token,
      };
      // If test_event_code is configured, include it so events stay in test sandbox
      if (config.test_event_code) payload.test_event_code = config.test_event_code;

      const res = await axios.post(
        `https://graph.facebook.com/v19.0/${config.pixel_id}/events`,
        payload
      );
      // CAPI returns { events_received: N } on success
      const received = (res.data as Record<string, unknown>).events_received;
      result = { success: true, pixelName: `${received ?? 1} event(s) received by Meta` };
    } catch (err: unknown) {
      const error = err as { response?: { data?: unknown }; message?: string };
      result = { success: false, error: JSON.stringify(error.response?.data || error.message) };
    }
  } else {
    result = { success: false, error: 'Unknown integration type' };
  }

  // Update last_tested timestamp
  await serviceClient
    .from('integrations')
    .update({ last_tested: new Date().toISOString() })
    .eq('id', integration_id);

  return NextResponse.json(result);
}
