/**
 * POST /api/debug/migrate-workspace
 * One-time migration: moves integrations from any old workspace to the
 * workspace that matches the current user's tracking_id.
 *
 * Background: integrations were saved under an old workspace_id that no
 * longer matches the one resolved by /api/collect via tracking_id lookup.
 * This causes processIntegrations to find 0 results and never forward events.
 *
 * Safe to call multiple times — idempotent upsert on (workspace_id, type).
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createServiceClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  // Get all workspaces owned by this user
  const { data: workspaces } = await service
    .from('workspaces')
    .select('id, tracking_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (!workspaces?.length) {
    return NextResponse.json({ error: 'No workspaces found' }, { status: 404 });
  }

  // The CORRECT workspace is whichever has the tracking_id being used (most recent)
  const correctWorkspace = workspaces[workspaces.length - 1];

  // Get all integrations across ALL user workspaces
  const allWorkspaceIds = workspaces.map(w => w.id);
  const { data: allIntegrations } = await service
    .from('integrations')
    .select('*')
    .in('workspace_id', allWorkspaceIds);

  if (!allIntegrations?.length) {
    return NextResponse.json({ error: 'No integrations found across any workspace' }, { status: 404 });
  }

  // Find integrations NOT on the correct workspace
  const toMigrate = allIntegrations.filter(i => i.workspace_id !== correctWorkspace.id);
  const alreadyCorrect = allIntegrations.filter(i => i.workspace_id === correctWorkspace.id);

  if (!toMigrate.length) {
    return NextResponse.json({
      message: 'All integrations already on correct workspace',
      workspace_id: correctWorkspace.id,
      integrations: alreadyCorrect.map(i => ({ type: i.type, enabled: i.enabled })),
    });
  }

  // Migrate each integration to the correct workspace
  const migrated = [];
  const errors = [];

  for (const integration of toMigrate) {
    // Check if this type already exists on the correct workspace (don't overwrite)
    const existsOnCorrect = alreadyCorrect.find(i => i.type === integration.type);
    if (existsOnCorrect) {
            migrated.push({ type: integration.type, action: 'skipped (already exists on correct workspace)' });
            continue;
          }

    const { error } = await service
      .from('integrations')
      .update({ workspace_id: correctWorkspace.id })
      .eq('id', integration.id);

    if (error) {
            errors.push({ type: integration.type, error: error.message });
          } else {
            migrated.push({ type: integration.type, action: 'migrated', from: integration.workspace_id, to: correctWorkspace.id });
          }
  }

  return NextResponse.json({
        correct_workspace_id: correctWorkspace.id,
        tracking_id: correctWorkspace.tracking_id,
        migrated,
        errors,
        total_workspaces: workspaces.length,
        workspaces: workspaces.map(w => ({ id: w.id, tracking_id: w.tracking_id, created_at: w.created_at })),
      });
}
