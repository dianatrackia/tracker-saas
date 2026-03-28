/**
 * GET /api/verify-domain?domain=track.example.com
 *
 * Checks if the CNAME record exists and points to Vercel
 * using Cloudflare's DNS-over-HTTPS (works in any environment, no Node.js dns module needed).
 *
 * Public endpoint — no auth required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// CNAME type = 5 in DNS
const CNAME_TYPE = 5;

// Known Vercel CNAME targets
const VERCEL_CNAME_PATTERNS = [
  'vercel-dns.com',
  'vercel.app',
  'vercel.com',
];

function isVercelTarget(cname: string): boolean {
  return VERCEL_CNAME_PATTERNS.some(p => cname.toLowerCase().includes(p));
}

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain')?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json({ error: 'Missing domain param' }, { status: 400 });
  }

  try {
    // Cloudflare DNS-over-HTTPS — returns JSON, works at Edge
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const dnsRes = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=CNAME`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!dnsRes.ok) {
      return NextResponse.json({ status: 'error', message: 'DNS lookup failed' });
    }

    const dnsData = await dnsRes.json();
    const answers: Array<{ type: number; data: string }> = dnsData.Answer || [];

    // Find the CNAME record
    const cnameRecord = answers.find(a => a.type === CNAME_TYPE);

    if (!cnameRecord) {
      return NextResponse.json({
        status: 'pending',
        message: 'CNAME record not found yet. DNS changes can take up to 48h.',
      });
    }

    // Remove trailing dot from DNS response
    const cnameTarget = cnameRecord.data.replace(/\.$/, '');
    const pointsToVercel = isVercelTarget(cnameTarget);

    if (!pointsToVercel) {
      return NextResponse.json({
        status: 'wrong_target',
        cname: cnameTarget,
        message: `El CNAME apunta a ${cnameTarget}, no a Vercel. Debe apuntar a cname.vercel-dns.com`,
      });
    }

    // Mark as verified in DB (best-effort, no auth needed since we only set verified=true)
    try {
      const service = createServiceClient();
      await service
        .from('workspaces')
        .update({ custom_domain_verified: true })
        .eq('custom_domain', domain);
    } catch {
      // Non-critical — don't fail the response
    }

    return NextResponse.json({
      status: 'active',
      cname: cnameTarget,
      message: '¡Dominio activo! El CNAME apunta a Vercel correctamente.',
    });
  } catch (err) {
    console.error('[verify-domain]', err);
    return NextResponse.json({ status: 'error', message: 'Error al verificar el dominio' });
  }
}
