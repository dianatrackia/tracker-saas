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

  const { data, error } = await supabase
    .from('integrations')
    .select('id, workspace_id, type, enabled, last_tested, created_at, updated_at')
    .order('type');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return without decrypted config values — only show which fields exist
  return NextResponse.json({ integrations: data });
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

  let result: { success: boolean; error?: string; listName?: string; accountName?: string };

  if (integration.type === 'activecampaign') {
    const { testACConnection } = await import('@/lib/integrations/activecampaign');
    result = await testACConnection(config as { api_url: string; api_key: string });
  } else if (integration.type === 'mailchimp') {
    const { testMailchimpConnection } = await import('@/lib/integrations/mailchimp');
    result = await testMailchimpConnection(config as { api_key: string; list_id: string });
  } else if (integration.type === 'stripe') {
    const { testStripeConnection } = await import('@/lib/integrations/stripe-verify');
    result = await testStripeConnection(config as { secret_key: string; webhook_secret: string });
  } else if (integration.type === 'meta') {
    // Test Meta by fetching pixel info
    const axios = (await import('axios')).default;
    try {
      await axios.get(
        `https://graph.facebook.com/v19.0/${config.pixel_id}`,
        { params: { access_token: config.access_token } }
      );
      result = { success: true };
    } catch (err: unknown) {
      const error = err as { message?: string };
      result = { success: false, error: error.message };
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
