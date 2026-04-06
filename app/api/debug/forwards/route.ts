/**
 * GET /api/debug/forwards?limit=20
 * Returns recent event_forwards for the authenticated user's workspace.
 * Shows integration pipeline health: did Meta/Mailchimp/AC/Stripe fire?
 * Remove or gate behind an env flag before going fully public.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get the user's workspace
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, tracking_id')
    .eq('user_id', user.id)
    .single();

  if (!workspace) return NextResponse.json({ error: 'No workspace' }, { status: 404 });

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '30');

  // Get recent events with their forwards
  const { data: events } = await supabase
    .from('events')
    .select(`
      id,
      event_name,
      email,
      value,
      order_id,
      verified,
      verified_by,
      created_at,
      event_forwards (
        integration,
        status,
        error_msg,
        response,
        created_at
      )
    `)
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Summary stats
  const allForwards = (events || []).flatMap((e: { event_forwards?: { integration: string; status: string; error_msg?: string }[] }) => e.event_forwards || []);
  const summary = {
    total_events: events?.length || 0,
    total_forwards: allForwards.length,
    by_integration: {} as Record<string, { success: number; error: number; errors: string[] }>,
  };

  for (const fwd of allForwards) {
    const f = fwd as { integration: string; status: string; error_msg?: string };
    if (!summary.by_integration[f.integration]) {
      summary.by_integration[f.integration] = { success: 0, error: 0, errors: [] };
    }
    if (f.status === 'success') {
      summary.by_integration[f.integration].success++;
    } else {
      summary.by_integration[f.integration].error++;
      if (f.error_msg) summary.by_integration[f.integration].errors.push(f.error_msg);
    }
  }

  return NextResponse.json({
    workspace_id: workspace.id,
    tracking_id: workspace.tracking_id,
    summary,
    events: (events || []).map((e: {
      id: string;
      event_name: string;
      email?: string;
      value?: number;
      order_id?: string;
      verified?: boolean;
      verified_by?: string;
      created_at: string;
      event_forwards?: { integration: string; status: string; error_msg?: string; response?: unknown; created_at: string }[];
    }) => ({
      id: e.id,
      event: e.event_name,
      email: e.email ? e.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null,
      value: e.value,
      order_id: e.order_id,
      verified: e.verified,
      verified_by: e.verified_by,
      created_at: e.created_at,
      forwards: e.event_forwards || [],
    })),
  });
}
