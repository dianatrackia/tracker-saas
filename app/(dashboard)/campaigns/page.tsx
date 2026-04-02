import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TrendingUp, Folder, Users, Megaphone } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type Stats = { visits: number; leads: number; purchases: number; revenue: number };
type AdTree      = Record<string, Stats>;
type AdSetEntry  = Stats & { ads: AdTree };
type AdSetTree   = Record<string, AdSetEntry>;
type CampaignEntry = Stats & { adsets: AdSetTree };
type CampaignTree  = Record<string, CampaignEntry>;
type ChannelEntry  = Stats & { source: string; medium: string; campaigns: CampaignTree };
type ChannelTree   = Record<string, ChannelEntry>;

function emptyStats(): Stats {
  return { visits: 0, leads: 0, purchases: 0, revenue: 0 };
}
function addToStats(s: Stats, eventName: string, value: number | null) {
  if (eventName === 'page_view') s.visits++;
  else if (eventName === 'lead') s.leads++;
  else if (eventName === 'purchase') { s.purchases++; s.revenue += value || 0; }
}

// ── Rate-coloring helpers ────────────────────────────────────────────────────
function leadRateClass(rate: number) {
  if (rate >= 0.05) return 'text-green-600 font-semibold';
  if (rate >= 0.02) return 'text-yellow-600 font-medium';
  if (rate > 0)     return 'text-red-500';
  return 'text-slate-300';
}
function purchRateClass(rate: number) {
  if (rate >= 0.30) return 'text-green-600 font-semibold';
  if (rate >= 0.10) return 'text-yellow-600 font-medium';
  if (rate > 0)     return 'text-red-500';
  return 'text-slate-300';
}

// ── Shared StatsRow component ────────────────────────────────────────────────
function StatsRow({ stats, light }: { stats: Stats; light?: boolean }) {
  const leadRate  = stats.visits > 0 ? stats.leads     / stats.visits : 0;
  const purchRate = stats.leads  > 0 ? stats.purchases / stats.leads  : 0;
  const numClass  = light ? 'text-slate-300' : 'text-slate-600';
  const boldClass = light ? 'text-white'     : 'text-slate-800';

  return (
    <div className="flex items-center gap-4 shrink-0 tabular-nums text-sm">
      {/* Visitas */}
      <div className={`flex items-center gap-1 min-w-[52px] justify-end ${numClass}`}>
        <span>{stats.visits}</span>
        <span className="text-[10px] opacity-60">vis</span>
      </div>

      {/* Leads */}
      <div className="flex items-center gap-1 min-w-[95px] justify-end">
        <span className={`font-medium ${boldClass}`}>{stats.leads}</span>
        <span className={`text-[10px] ${numClass}`}>lead</span>
        {stats.visits > 0 && (
          <span className={`text-xs ml-0.5 ${leadRateClass(leadRate)}`}>
            {(leadRate * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Compras */}
      <div className="flex items-center gap-1 min-w-[110px] justify-end">
        <span className={`font-medium ${boldClass}`}>{stats.purchases}</span>
        <span className={`text-[10px] ${numClass}`}>comp</span>
        {stats.leads > 0 && (
          <span className={`text-xs ml-0.5 ${purchRateClass(purchRate)}`}>
            {(purchRate * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Revenue */}
      <div className="min-w-[72px] text-right">
        {stats.revenue > 0
          ? <span className={`font-bold ${light ? 'text-green-300' : 'text-green-600'}`}>${stats.revenue.toFixed(0)}</span>
          : <span className={numClass}>—</span>
        }
      </div>
    </div>
  );
}

// ── Source badge colors ──────────────────────────────────────────────────────
const SRC_BADGE: Record<string, string> = {
  facebook:  'bg-blue-600 text-white',
  instagram: 'bg-pink-600 text-white',
  google:    'bg-yellow-500 text-slate-900',
  tiktok:    'bg-black text-white',
  organic:   'bg-green-600 text-white',
  direct:    'bg-slate-500 text-white',
  email:     'bg-indigo-600 text-white',
};

// ── Page ────────────────────────────────────────────────────────────────────
export default async function CampaignsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('user_id', user.id)
    .single();
  if (!workspace) redirect('/login');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from('events')
    .select('event_name, properties, value')
    .eq('workspace_id', workspace.id)
    .gte('created_at', thirtyDaysAgo)
    .in('event_name', ['page_view', 'lead', 'purchase'])
    .limit(5000);

  // ── Build attribution tree ────────────────────────────────────────────────
  const tree: ChannelTree = {};

  events?.forEach(event => {
    const props  = (event.properties as Record<string, unknown>) || {};
    const utms   = (props.utms as Record<string, string>) || {};
    const source = (props.source as string) || 'direct';
    const medium = (props.medium as string) || 'none';
    const chKey  = `${source}::${medium}`;
    const camp   = utms.utm_campaign || '(sin campaña)';
    const adset  = utms.utm_term    || '(sin conjunto)';
    const ad     = utms.utm_content || '(sin anuncio)';

    if (!tree[chKey]) {
      tree[chKey] = { ...emptyStats(), source, medium, campaigns: {} };
    }
    addToStats(tree[chKey], event.event_name, event.value);

    if (!tree[chKey].campaigns[camp]) {
      tree[chKey].campaigns[camp] = { ...emptyStats(), adsets: {} };
    }
    addToStats(tree[chKey].campaigns[camp], event.event_name, event.value);

    if (!tree[chKey].campaigns[camp].adsets[adset]) {
      tree[chKey].campaigns[camp].adsets[adset] = { ...emptyStats(), ads: {} };
    }
    addToStats(tree[chKey].campaigns[camp].adsets[adset], event.event_name, event.value);

    if (!tree[chKey].campaigns[camp].adsets[adset].ads[ad]) {
      tree[chKey].campaigns[camp].adsets[adset].ads[ad] = emptyStats();
    }
    addToStats(tree[chKey].campaigns[camp].adsets[adset].ads[ad], event.event_name, event.value);
  });

  // Sort helper
  const byVisits = ([, a]: [string, Stats], [, b]: [string, Stats]) => b.visits - a.visits;

  const channels = Object.entries(tree).sort(byVisits);
  const isEmpty  = channels.length === 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Campañas</h1>
        <p className="text-slate-500 text-sm mt-1">
          Atribución real · Canal → Campaña → Conjunto → Anuncio · Últimos 30 días
        </p>
      </div>

      {/* Legend */}
      {!isEmpty && (
        <div className="flex items-center gap-6 mb-5 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            Lead rate ≥ 5% / Compra rate ≥ 30%
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
            Lead ≥ 2% / Compra ≥ 10%
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
            Por debajo del umbral
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="card p-14 text-center text-slate-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium text-slate-600">No hay datos de campaña todavía</p>
          <p className="text-sm mt-1">
            Los eventos con <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">utm_campaign</code> aparecerán aquí automáticamente.
          </p>
        </div>
      )}

      {/* Channel blocks */}
      {channels.map(([chKey, ch]) => {
        const label    = ch.medium !== 'none' ? `${ch.source} / ${ch.medium}` : ch.source;
        const srcBadge = SRC_BADGE[ch.source.toLowerCase()] || 'bg-slate-600 text-white';
        const sortedCampaigns = Object.entries(ch.campaigns).sort(byVisits);

        return (
          <div key={chKey} className="mb-6 rounded-xl overflow-hidden border border-slate-200 shadow-sm">

            {/* ── Channel header (dark) ───────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${srcBadge}`}>
                {label}
              </span>
              <StatsRow stats={ch} light />
            </div>

            {/* ── Campaigns ───────────────────────────────────────────── */}
            {sortedCampaigns.map(([campName, camp], campIdx) => {
              const sortedAdsets = Object.entries(camp.adsets).sort(byVisits);
              const isLastCamp   = campIdx === sortedCampaigns.length - 1;

              return (
                <div key={campName}>
                  {/* Campaign row */}
                  <div className={`flex items-center justify-between px-5 py-3 bg-white ${!isLastCamp || sortedAdsets.length > 0 ? 'border-b border-slate-100' : ''} hover:bg-slate-50/60 transition-colors`}>
                    <div className="flex items-center gap-2.5 pl-1">
                      <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Campaña</span>
                      <span className="text-sm font-semibold text-slate-800">{campName}</span>
                    </div>
                    <StatsRow stats={camp} />
                  </div>

                  {/* ── Adsets ─────────────────────────────────────────── */}
                  {sortedAdsets.map(([adsetName, adset], adsetIdx) => {
                    const sortedAds  = Object.entries(adset.ads).sort(byVisits);
                    const isLastAdset = adsetIdx === sortedAdsets.length - 1;

                    return (
                      <div key={adsetName}>
                        {/* Adset row */}
                        <div className={`flex items-center justify-between px-5 py-2.5 bg-slate-50/40 ${!isLastAdset || sortedAds.length > 0 ? 'border-b border-slate-100' : ''} hover:bg-slate-50 transition-colors`}>
                          <div className="flex items-center gap-2 pl-8">
                            <Users className="w-3 h-3 text-slate-300 shrink-0" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conjunto</span>
                            <span className="text-sm text-slate-700">{adsetName}</span>
                          </div>
                          <StatsRow stats={adset} />
                        </div>

                        {/* ── Ads ──────────────────────────────────────── */}
                        {sortedAds.map(([adName, adStats], adIdx) => {
                          const isLastAd = adIdx === sortedAds.length - 1;
                          return (
                            <div
                              key={adName}
                              className={`flex items-center justify-between px-5 py-2 bg-white ${!isLastAd || !isLastAdset ? 'border-b border-slate-50' : ''} hover:bg-slate-50/40 transition-colors`}
                            >
                              <div className="flex items-center gap-2 pl-[52px]">
                                <Megaphone className="w-3 h-3 text-slate-200 shrink-0" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Anuncio</span>
                                <span className="text-sm text-slate-600">{adName}</span>
                              </div>
                              <StatsRow stats={adStats} />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
