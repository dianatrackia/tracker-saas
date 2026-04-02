/**
 * GET /api/oauth/stripe/callback
 * Handles Stripe Connect OAuth callback. Exchanges code for access token,
 * fetches account display name, saves encrypted config, redirects to integrations.
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
    return NextResponse.redirect(`${appUrl}/integrations?error=stripe_denied`);
  }

  // CSRF check
  const storedState = req.cookies.get('stripe_oauth_state')?.value;
  if (!state || state !== storedState) {
    return NextResponse.redirect(`${appUrl}/integrations?error=stripe_state`);
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login`);

  // Exchange code for access token
  const tokenRes = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_secret: process.env.STRIPE_SECRET_KEY!,
      code,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json() as {
    access_token?: string;
    stripe_user_id?: string;
    error?: string;
  };

  if (!tokenData.access_token) {
    console.error('[oauth/stripe] Token exchange failed:', tokenData);
    return NextResponse.redirect(`${appUrl}/integrations?error=stripe_token`);
  }

  // Get account name for display
  let displayName = 'Cuenta Stripe';
  try {
    const accountRes = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const account = await accountRes.json() as {
      business_profile?: { name?: string };
      email?: string;
      display_name?: string;
    };
    displayName = account.business_profile?.name || account.display_name || account.email || displayName;
  } catch { /* use default */ }

  // Save integration
  const service = createServiceClient();
  const { data: workspace } = await service
    .from('workspaces').select('id').eq('user_id', user.id).single();
  if (!workspace) return NextResponse.redirect(`${appUrl}/integrations?error=no_workspace`);

  const config = encrypt(JSON.stringify({
    connection_method: 'oauth',
    display_name: displayName,
    access_token: tokenData.access_token,
    stripe_user_id: tokenData.stripe_user_id || '',
    webhook_secret: '',           // user still needs to configure this
  }));

  await service.from('integrations').upsert(
    { workspace_id: workspace.id, type: 'stripe', config: { encrypted: config }, enabled: true },
    { onConflict: 'workspace_id,type' }
  );

  const response = NextResponse.redirect(
    `${appUrl}/integrations?connected=stripe&name=${encodeURIComponent(displayName)}`
  );
  response.cookies.delete('stripe_oauth_state');
  return response;
}
