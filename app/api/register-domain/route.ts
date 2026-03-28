/**
 * POST /api/register-domain
 * Saves the customer's custom domain and (if VERCEL_TOKEN is set)
 * auto-registers it on the Vercel project.
 *
 * DELETE /api/register-domain
 * Removes the custom domain from the workspace.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Very basic domain validator — does NOT allow bare IPs or localhost */
function isValidDomain(d: string): boolean {
  return /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i.test(d);
}

/** Optionally registers the domain in the Vercel project via the Domains API */
async function registerWithVercel(domain: string): Promise<'registered' | 'manual' | 'conflict' | 'error'> {
  const token   = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return 'manual';

  try {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${project}/domains`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: domain }),
      }
    );
    if (res.ok) return 'registered';
    const body = await res.json().catch(() => ({}));
    // 409 = domain already added (idempotent)
    if (res.status === 409 || body?.error?.code === 'domain_already_in_use') return 'registered';
    return 'error';
  } catch {
    return 'error';
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const domain = (body.domain as string || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '');  // strip protocol if pasted by accident

  if (!domain || !isValidDomain(domain)) {
    return NextResponse.json(
      { error: 'Formato de dominio inválido. Ejemplo: track.tudominio.com' },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Persist in DB
  const { error: dbError } = await service
    .from('workspaces')
    .update({ custom_domain: domain, custom_domain_verified: false })
    .eq('user_id', user.id);

  if (dbError) {
    console.error('[register-domain] DB error:', dbError);
    return NextResponse.json({ error: 'No se pudo guardar el dominio' }, { status: 500 });
  }

  // Try to add to Vercel
  const vercelStatus = await registerWithVercel(domain);

  return NextResponse.json({ ok: true, domain, vercelStatus });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  await service
    .from('workspaces')
    .update({ custom_domain: null, custom_domain_verified: false })
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
