import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Activity, Eye, MousePointerClick, Users, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const EVENT_LABELS: Record<string, string> = {
  page_view: 'Visita',
  scroll_25: 'Scroll 25%',
  scroll_50: 'Scroll 50%',
  scroll_75: 'Scroll 75%',
  scroll_100: 'Scroll 100%',
  lead: 'Lead',
  purchase: 'Compra',
};

const EVENT_COLORS: Record<string, string> = {
  page_view: 'bg-blue-100 text-blue-700',
  scroll_25: 'bg-slate-100 text-slate-600',
  scroll_50: 'bg-slate-100 text-slate-600',
  scroll_75: 'bg-orange-100 text-orange-700',
  scroll_100: 'bg-orange-100 text-orange-700',
  lead: 'bg-green-100 text-green-700',
  purchase: 'bg-purple-100 text-purple-700',
};

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!workspace) redirect('/login');

  // Stats for last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalPageViews },
    { count: totalLeads },
    { count: totalPurchases },
    { count: totalVisitors },
    { data: recentEvents },
    { data: purchaseStats },
  ] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id).eq('event_name', 'page_view').gte('created_at', thirtyDaysAgo),
    supabase.from('events').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id).eq('event_name', 'lead').gte('created_at', thirtyDaysAgo),
    supabase.from('events').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id).eq('event_name', 'purchase').gte('created_at', thirtyDaysAgo),
    supabase.from('visitors').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id).gte('first_seen', thirtyDaysAgo),
    supabase.from('events').select('*').eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false }).limit(15),
    supabase.from('events').select('value').eq('workspace_id', workspace.id)
      .eq('event_name', 'purchase').eq('verified', true).gte('created_at', thirtyDaysAgo).not('value', 'is', null),
  ]);

  const revenue = purchaseStats?.reduce((sum, e) => sum + (e.value || 0), 0) || 0;

  const stats = [
    { label: 'Visitas (30d)', value: totalPageViews?.toLocaleString() || '0', icon: Eye, color: 'text-blue-600 bg-blue-50' },
    { label: 'Leads (30d)', value: totalLeads?.toLocaleString() || '0', icon: Users, color: 'text-green-600 bg-green-50' },
    { label: 'Compras (30d)', value: totalPurchases?.toLocaleString() || '0', icon: MousePointerClick, color: 'text-purple-600 bg-purple-50' },
    { label: 'Revenue verificado', value: `$${revenue.toFixed(2)}`, icon: TrendingUp, color: 'text-orange-600 bg-orange-50' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Resumen</h1>
        <p className="text-slate-500 text-sm mt-1">Últimos 30 días · {workspace.name}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(stat => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent events */}
      <div className="card">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Eventos recientes</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {recentEvents?.length ? recentEvents.map(event => (
            <div key={event.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EVENT_COLORS[event.event_name] || 'bg-gray-100 text-gray-600'}`}>
                {EVENT_LABELS[event.event_name] || event.event_name}
              </span>
              <span className="text-sm text-slate-600 truncate flex-1">
                {event.url ? new URL(event.url).pathname : '—'}
              </span>
              {event.email && (
                <span className="text-xs text-slate-400">{event.email}</span>
              )}
              {event.value && (
                <span className="text-xs font-medium text-green-600">${event.value}</span>
              )}
              {event.verified && (
                <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">✓ verificado</span>
              )}
              <span className="text-xs text-slate-400 shrink-0">
                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: es })}
              </span>
            </div>
          )) : (
            <div className="p-8 text-center text-slate-400 text-sm">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Aún no hay eventos. Instala el snippet en tu sitio web.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
