'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Activity, RefreshCw, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TrackingEvent } from '@/types';

const EVENT_LABELS: Record<string, string> = {
  page_view:   'Page View',
  scroll_25:   'Scroll 25%',
  scroll_50:   'Scroll 50%',
  scroll_75:   'Scroll 75%',
  scroll_100:  'Scroll 100%',
  lead:        'Lead',
  purchase:    'Purchase',
};

const EVENT_COLORS: Record<string, string> = {
  page_view:  'bg-blue-100 text-blue-700',
  scroll_25:  'bg-slate-100 text-slate-500',
  scroll_50:  'bg-slate-100 text-slate-500',
  scroll_75:  'bg-yellow-100 text-yellow-700',
  scroll_100: 'bg-orange-100 text-orange-700',
  lead:       'bg-green-100 text-green-700',
  purchase:   'bg-purple-100 text-purple-700',
};

type FilterType = 'all' | 'page_view' | 'scroll_25' | 'scroll_50' | 'scroll_75' | 'scroll_100' | 'lead' | 'purchase';

export default function EventsPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [liveMode, setLiveMode] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Get workspace ID
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('workspaces').select('id').eq('user_id', user.id).single();
      if (data) setWorkspaceId(data.id);
    });
  }, []);

  const loadEvents = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);

    let query = supabase
      .from('events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') {
      query = query.eq('event_name', filter);
    }

    const { data } = await query;
    if (data) setEvents(data as TrackingEvent[]);
    setLoading(false);
  }, [workspaceId, filter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Real-time subscription
  useEffect(() => {
    if (!workspaceId || !liveMode) return;

    const channel = supabase
      .channel('events-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'events',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const newEvent = payload.new as TrackingEvent;
          if (filter === 'all' || newEvent.event_name === filter) {
            setEvents(prev => [newEvent, ...prev.slice(0, 99)]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, liveMode, filter]);

  const filterOptions: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'page_view', label: 'Page Views' },
    { value: 'lead', label: 'Leads' },
    { value: 'purchase', label: 'Compras' },
    { value: 'scroll_25', label: 'Scroll 25%' },
    { value: 'scroll_50', label: 'Scroll 50%' },
    { value: 'scroll_75', label: 'Scroll 75%' },
    { value: 'scroll_100', label: 'Scroll 100%' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Eventos</h1>
          <p className="text-slate-500 text-sm mt-1">Stream en tiempo real de todos los eventos.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLiveMode(!liveMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              liveMode
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${liveMode ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
            {liveMode ? 'En vivo' : 'Pausado'}
          </button>
          <button onClick={loadEvents} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              filter === opt.value
                ? 'bg-brand-500 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Events table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-500">Evento</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">URL</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Email</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Valor</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Verificado</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  Cargando eventos...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-slate-400">No hay eventos{filter !== 'all' ? ` de tipo "${EVENT_LABELS[filter]}"` : ''}.</p>
                </td>
              </tr>
            ) : (
              events.map(event => (
                <tr key={event.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EVENT_COLORS[event.event_name] || 'bg-gray-100 text-gray-600'}`}>
                      {EVENT_LABELS[event.event_name] || event.event_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                    {event.url ? (
                      <span title={event.url}>
                        {new URL(event.url).pathname}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {event.email || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {event.value ? (
                      <span className="text-green-600 font-medium">${event.value} {event.currency}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {event.verified ? (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        ✓ {event.verified_by}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {format(new Date(event.created_at), "dd MMM HH:mm:ss", { locale: es })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
