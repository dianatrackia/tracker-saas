/**
 * GET /api/oauth/mailchimp
 * Initiates Mailchimp OAuth 2.0 flow.
 * Requires env: MAILCHIMP_CLIENT_ID
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function generateState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const clientId = process.env.MAILCHIMP_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL('/integrations?error=mailchimp_not_configured', req.url));
  }

  const state = generateState();
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/mailchimp/callback`;

  const url = new URL('https://login.mailchimp.com/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);

  const response = NextResponse.redirect(url);
  response.cookies.set('mc_oauth_state', state, {
    httpOnly: true, sameSite: 'lax', maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
