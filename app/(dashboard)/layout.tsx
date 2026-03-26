import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Activity, LogOut } from 'lucide-react';
import { NavLinks } from '@/components/dashboard/nav-links';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name, tracking_id')
    .eq('user_id', user.id)
    .single();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-brand-500 rounded-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900">TrackerSaaS</span>
          </div>
          {workspace && (
            <div className="mt-3 px-2 py-1.5 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Workspace</p>
              <p className="text-sm font-medium text-slate-800 truncate">{workspace.name}</p>
            </div>
          )}
        </div>

        {/* Nav — client component for active state */}
        <NavLinks />

        {/* Bottom */}
        <div className="p-4 border-t border-slate-100 space-y-1">
          <a href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Configuración
          </a>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600
                         hover:bg-red-50 hover:text-red-600 transition-colors w-full text-left"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
