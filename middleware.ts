import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Use hostname (no port) for reliable comparison
  const hostname = request.nextUrl.hostname;
  const mainHost = (process.env.NEXT_PUBLIC_APP_URL || '')
    .replace(/^https?:\/\//, '').replace(/\/$/, '').split(':')[0];

  // ── Custom domain pass-through ────────────────────────────────────────────
  // When a customer's CNAME subdomain (e.g. track.theirdomain.com) hits our
  // Vercel deployment, we allow tracking-specific paths without any auth check.
  // The dashboard is NOT served on custom domains.
  const isCustomDomain =
    mainHost &&
    hostname !== mainHost &&
    !hostname.endsWith('.vercel.app') &&
    !hostname.includes('localhost');

  if (isCustomDomain) {
    const trackingPaths = ['/api/collect', '/api/webhooks', '/tracker.js'];
    const isTrackingPath = trackingPaths.some(p => pathname.startsWith(p));
    if (isTrackingPath) {
      // Let the request through — no auth needed for tracking endpoints
      const res = NextResponse.next({ request });
      // Allow cross-origin from the customer's own domain
      res.headers.set('Access-Control-Allow-Origin', `https://${hostname}`);
      res.headers.set('Access-Control-Allow-Credentials', 'true');
      return res;
    }
    // Any other path on a custom domain → redirect to main app
    return NextResponse.redirect(
      new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'https://tracker-saas.vercel.app')
    );
  }

  // ── Standard auth middleware (main app domain) ────────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabaseResponse.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Public routes that don't need auth
  const publicRoutes = [
    '/login',
    '/register',
    '/api/collect',
    '/api/webhooks',
    '/api/verify-domain',  // public — used by browser to check DNS
  ];
  const isPublic = publicRoutes.some(r => pathname.startsWith(r));

  // Redirect unauthenticated users to login
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|tracker.js).*)'],
};
