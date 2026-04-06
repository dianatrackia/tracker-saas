import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LogOut } from 'lucide-react';
import { NavLinks } from '@/components/dashboard/nav-links';

function DianaLogo({ size = 34 }: { size?: number }) {
    return (
          <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 5h11c9.389 0 15 5.611 15 15s-5.611 15-15 15H7V5z" fill="white" />
                <path d="M13 11h5c5.523 0 9 3.477 9 9s-3.477 9-9 9h-5V11z" fill="#0D1B2A" />
                <circle cx="22" cy="20" r="5.5" fill="#E53535" />
          </svg>svg>
        );
}

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
                <aside className="w-64 flex flex-col shrink-0" style={{ backgroundColor: '#0D1B2A' }}>
                        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                  <div className="flex items-center gap-3">
                                              <DianaLogo size={34} />
                                              <div className="leading-none">
                                                            <span className="font-extrabold text-white text-base tracking-wide block">DIANA</span>span>
                                                            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#E53535' }}>Tracking</span>span>
                                              </div>div>
                                  </div>div>
                          {workspace && (
                        <div className="mt-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                      <p className="text-xs mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Workspace</p>p>
                                      <p className="text-sm font-semibold text-white truncate">{workspace.name}</p>p>
                        </div>div>
                                  )}
                        </div>div>
                        <NavLinks />
                        <div className="p-4 space-y-0.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                  <a href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>svg>
                                              Configuracion
                                  </a>a>
                                  <form action="/api/auth/signout" method="post">
                                              <button type="submit" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-left" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                                            <LogOut className="w-4 h-4 shrink-0" />
                                                            Cerrar sesion
                                              </button>button>
                                  </form>form>
                        </div>div>
                </aside>aside>
                <main className="flex-1 overflow-y-auto">{children}</main>main>
          </div>div>
        );
}</svg>
