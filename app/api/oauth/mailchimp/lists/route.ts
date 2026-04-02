/**
 * GET  /api/oauth/mailchimp/lists  — Returns all Mailchimp audiences for the connected account
 * POST /api/oauth/mailchimp/lists  — Updates the selected list_id in the integration config
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';

async function getMailchimpIntegration(userId: string) {
  const service = createServiceClient();
  const { data: workspace } = await service
    .from('workspaces').select('id').eq('user_id', userId).single();
  if (!workspace) return null;

  const { data: integration } = await service
    .from('integrations')
    .select('id, config')
    .eq('workspace_id', workspace.id)
    .eq('type', 'mailchimp')
    .single();
  if (!integration) return null;

  let config: Record<string, string>;
  try { config = JSON.parse(decrypt(integration.config.encrypted)); }
  catch { return null; }

  return { integration, workspace, config };
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await getMailchimpIntegration(user.id);
  if (!result || result.config.connection_method !== 'oauth') {
    return NextResponse.json({ error: 'No Mailchimp OAuth connection found' }, { status: 404 });
  }

  const { dc, access_token } = result.config;
  const res = await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists?count=50&fields=lists.id,lists.name,lists.stats.member_count`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const data = await res.json() as { lists?: { id: string; name: string; stats: { member_count: number } }[] };
  return NextResponse.json({ lists: data.lists || [], selected: result.config.list_id });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { list_id, list_name } = await req.json() as { list_id: string; list_name: string };

  const result = await getMailchimpIntegration(user.id);
  if (!result) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });

  const newConfig = {
    ...result.config,
    list_id,
    list_name,
    display_name: `${result.config.account_email} · ${list_name}`,
  };

  const service = createServiceClient();
  await service.from('integrations')
    .update({ config: { encrypted: encrypt(JSON.stringify(newConfig)) } })
    .eq('id', result.integration.id);

  return NextResponse.json({ ok: true });
}
