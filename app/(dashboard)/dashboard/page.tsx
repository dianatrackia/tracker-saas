import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Activity, Eye, MousePointerClick, Users, TrendingUp, ShieldCheck } from 'lucide-react';
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

const SOURCE_COLORS: Record<string, string> = {
  facebook:  'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  google:    'bg-yellow-100 text-yellow-700',
  tiktok:    'bg-slate-900 text-white',
  organic:   'bg-green-100 text-green-700',
  direct:    'bg-slate-100 text-slate-600',
  email:     'bg-indigo-100 text-indigo-700',
};

// Conversion rate coloring helpers
function leadRateClass(rate: number): string {
  if (rate >= 0.05) return 'text-green-600 font-semibold';
  if (rate >= 0.02) return 'text-yellow-600 font-medium';
  if (rate > 0)     return 'text-red-500';
  return 'text-slate-400';
}
function purchRateClass(rate: number): string {
  if (rate >= 0.30) return 'text-green-600 font-semibold';
  if (rate >= 0.10) return 'text-yellow-600 font-medium';
  if (rate > 0)     return 'text-red-500';
  return 'text-slate-400';
}

// Health progress bar row
function HealthMetric({
  label, value, total, hint,
}: { label: string; value: number; total: number; hint?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const barColor =
    pct >= 90 ? 'bg-green-500' :
    pct >= 60 ? 'bg-yellow-400' :
    'bg-red-400';
  const textColor =
    pct >= 90 ? 'text-green-600' :
    pct >= 60 ? 'text-yellow-600' :
    'text-red-500';
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-600">{label}</span>
        <span className={`text-xs font-bold ${textColor}`}>
          {total > 0 ? `${value}/${total} (${pct}%)` : '—'}
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">vía {hint}</p>}
    </div>
  );
}

type ChannelStats = {
  source: string;
  medium: string;
  visits: number;
  leads: number;
  purchases: number;
  revenue: number;
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalPageViews },
    { count: totalLeads },
    { count: totalPurchases },
    { count: totalVisitors },
    { data: recentEvents },
    { data: purchaseStats },
    { data: funnelEvents },
    { data: leadHealthData },
    { data: purchaseHealthData },
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
    // Funnel source data
    supabase.from('events')
      .select('event_name, properties, value')
      .eq('workspace_id', workspace.id)
      .gte('created_at', thirtyDaysAgo)
      .in('event_name', ['page_view', 'lead', 'purchase'])
      .limit(5000),
    // Lead health
    supabase.from('events')
      .select('email')
      .eq('workspace_id', workspace.id)
      .eq('event_name', 'lead')
      .gte('created_at', thirtyDaysAgo),
    // Purchase health
    supabase.from('events')
      .select('properties, verified')
      .eq('workspace_id', workspace.id)
      .eq('event_name', 'purchase')
      .gte('created_at', thirtyDaysAgo),
  ]);

  const revenue = purchaseStats?.reduce((sum, e) => sum + (e.value || 0), 0) || 0;

  // ── Aggregate funnel by channel ─────────────────────────────────────────
  const channelMap: Record<string, ChannelStats> = {};
  funnelEvents?.forEach(event => {
    const props = (event.properties as Record<string, unknown>) || {};
    const source = (props.source as string) || 'direct';
    const medium = (props.medium as string) || 'none';
    const key = `${source}::${medium}`;
    if (!channelMap[key]) {
      channelMap[key] = { source, medium, visits: 0, leads: 0, purchases: 0, revenue: 0 };
    }
    if (event.event_name === 'page_view') channelMap[key].visits++;
    else if (event.event_name === 'lead') channelMap[key].leads++;
    else if (event.event_name === 'purchase') {
      channelMap[key].purchases++;
      channelMap[key].revenue += (event.value as number) || 0;
    }
  });
  const channels = Object.values(channelMap).sort((a, b) => b.visits - a.visits);

  // ── Health metrics ───────────────────────────────────────────────────────
  const leadsTotal       = leadHealthData?.length || 0;
  const leadsWithEmail   = leadHealthData?.filter(l => l.email).length || 0;
  const purchasesTotal   = purchaseHealthData?.length || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purchasesWithFbc = purchaseHealthData?.filter(p => !!(p.properties as any)?.fbc).length || 0;
  const purchasesVerified = purchaseHealthData?.filter(p => p.verified).length || 0;

  const stats = [
    { label: 'Visitas (30d)',     value: totalPageViews?.toLocaleString() || '0', icon: Eye,              color: 'text-blue-600 bg-blue-50' },
    { label: 'Leads (30d)',       value: totalLeads?.toLocaleString()     || '0', icon: Users,            color: 'text-green-600 bg-green-50' },
    { label: 'Compras (30d)',     value: totalPurchases?.toLocaleString() || '0', icon: MousePointerClick, color: 'text-purple-600 bg-purple-50' },
    { label: 'Revenue verificado', value: `$${revenue.toFixed(2)}`,                icon: TrendingUp,       color: 'text-orange-600 bg-orange-50' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Resumen</h1>
        <p className="text-slate-500 text-sm mt-1">Últimos 30 días · {workspace.name}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

      {/* Embudo por canal + Health widget */}
      {channels.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

          {/* Embudo — 2/3 */}
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Embudo por canal</h2>
              <span className="ml-auto text-xs text-slate-400">30 días</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Canal</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Visitas</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Leads</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">% Lead</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Compras</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">% Compra</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {channels.map(ch => {
                    const leadRate  = ch.visits > 0  ? ch.leads     / ch.visits : 0;
                    const purchRate = ch.leads  > 0  ? ch.purchases / ch.leads  : 0;
                    const srcColor  = SOURCE_COLORS[ch.source.toLowerCase()] || 'bg-slate-100 text-slate-600';
                    const label     = ch.medium !== 'none' ? `${ch.source} / ${ch.medium}` : ch.source;
                    return (
                      <tr key={`${ch.source}::${ch.medium}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${srcColor}`}>{label}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-500 tabular-nums">{ch.visits}</td>
                        <td className="px-3 py-3 text-right font-medium text-slate-700 tabular-nums">{ch.leads}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${leadRateClass(leadRate)}`}>
                          {ch.visits > 0 ? `${(leadRate * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-700 tabular-nums">{ch.purchases}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${purchRateClass(purchRate)}`}>
                          {ch.leads > 0 ? `${(purchRate * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-green-600 tabular-nums">
                          {ch.revenue > 0 ? `$${ch.revenue.toFixed(0)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Calidad del tracking — 1/3 */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Calidad del tracking</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Un tracking incompleto afecta el ML de Meta y la atribución incremental. Apuntá a más del 90%.
            </p>
            <div className="space-y-5">
              <HealthMetric
                label="Leads con email"
                value={leadsWithEmail}
                total={leadsTotal}
              />
              <HealthMetric
                label="Compras con fbc (Meta click)"
                value={purchasesWithFbc}
                total={purchasesTotal}
              />
              <HealthMetric
                label="Compras verificadas"
                value={purchasesVerified}
                total={purchasesTotal}
                hint="Stripe"
              />
            </div>
          </div>
        </div>
      )}

      {/* Eventos recientes */}
      <div className="card">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Eventos recientes</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {recentEvents?.length ? recentEvents.map(event => (
            <div key={event.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${EVENT_COLORS[event.event_name] || 'bg-gray-100 text-gray-600'}`}>
                {EVENT_LABELS[event.event_name] || event.event_name}
              </span>
              <span className="text-sm text-slate-600 truncate flex-1">
                {event.url ? new URL(event.url).pathname : '—'}
              </span>
              {event.email && (
                <span className="text-xs text-slate-400 hidden sm:block truncate max-w-[180px]">{event.email}</span>
              )}
              {event.value && (
                <span className="text-xs font-medium text-green-600">${event.value}</span>
              )}
              {event.verified && (
                <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded shrink-0">✓</span>
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
