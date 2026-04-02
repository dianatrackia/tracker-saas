/**
 * GET /api/oauth/mailchimp/callback
 * Handles Mailchimp OAuth callback. Exchanges code for token,
 * fetches datacenter prefix + first audience, saves config.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/integrations?error=mailchimp_denied`);
  }

  const storedState = req.cookies.get('mc_oauth_state')?.value;
  if (!state || state !== storedState) {
    return NextResponse.redirect(`${appUrl}/integrations?error=mailchimp_state`);
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login`);

  const redirectUri = `${appUrl}/api/oauth/mailchimp/callback`;

  // Exchange code for access token
  const tokenRes = await fetch('https://login.mailchimp.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.MAILCHIMP_CLIENT_ID!,
      client_secret: process.env.MAILCHIMP_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      code,
    }),
  });
  const tokenData = await tokenRes.json() as { access_token?: string; error?: string };

  if (!tokenData.access_token) {
    console.error('[oauth/mailchimp] Token exchange failed:', tokenData);
    return NextResponse.redirect(`${appUrl}/integrations?error=mailchimp_token`);
  }

  // Get datacenter prefix from metadata
  const metaRes = await fetch('https://login.mailchimp.com/oauth2/metadata', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const meta = await metaRes.json() as { dc?: string; login?: { email?: string } };
  const dc = meta.dc || 'us1';
  const accountEmail = meta.login?.email || '';

  // Fetch audiences to auto-select first one
  let listId   = '';
  let listName = '';
  try {
    const listsRes = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists?count=10&fields=lists.id,lists.name`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const listsData = await listsRes.json() as { lists?: { id: string; name: string }[] };
    if (listsData.lists?.length) {
      listId   = listsData.lists[0].id;
      listName = listsData.lists[0].name;
    }
  } catch { /* ok, user can set manually */ }

  const displayName = listName
    ? `${accountEmail} · ${listName}`
    : accountEmail || 'Mailchimp';

  // Save integration
  const service = createServiceClient();
  const { data: workspace } = await service
    .from('workspaces').select('id').eq('user_id', user.id).single();
  if (!workspace) return NextResponse.redirect(`${appUrl}/integrations?error=no_workspace`);

  const config = encrypt(JSON.stringify({
    connection_method: 'oauth',
    display_name: displayName,
    access_token: tokenData.access_token,
    dc,
    list_id: listId,
    list_name: listName,
    account_email: accountEmail,
  }));

  await service.from('integrations').upsert(
    { workspace_id: workspace.id, type: 'mailchimp', config: { encrypted: config }, enabled: true },
    { onConflict: 'workspace_id,type' }
  );

  const response = NextResponse.redirect(
    `${appUrl}/integrations?connected=mailchimp&name=${encodeURIComponent(displayName)}`
  );
  response.cookies.delete('mc_oauth_state');
  return response;
}
