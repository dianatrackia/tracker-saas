'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const LABELS: Record<string, string> = {
  page_view: 'Visita',
  lead:      'Lead',
  purchase:  'Compra',
};

function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Stable IDs for this session
const VID = uid();
const SID = uid();

export default function TestPage() {
  const [source,   setSource]   = useState('facebook');
  const [medium,   setMedium]   = useState('cpc');
  const [campaign, setCampaign] = useState('campaña-prueba');
  const [term,     setTerm]     = useState('conjunto-prueba');
  const [content,  setContent]  = useState('anuncio-imagen-1');
  const [email,    setEmail]    = useState('');
  const [value,    setValue]    = useState('97');
  const [orderId,  setOrderId]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [tid,      setTid]      = useState<string | null>(null);

  // Fetch tracking_id lazily from workspace
  async function getTrackingId(): Promise<string | null> {
    if (tid) return tid;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: ws } = await supabase
      .from('workspaces')
      .select('tracking_id')
      .eq('user_id', user.id)
      .single();
    if (ws?.tracking_id) setTid(ws.tracking_id);
    return ws?.tracking_id || null;
  }

  async function sendEvent(eventName: string) {
    setLoading(true);
    setResult(null);

    const trackingId = await getTrackingId();
    if (!trackingId) {
      setResult({ ok: false, msg: 'No se encontró el tracking ID. ¿Estás logueado?' });
      setLoading(false);
      return;
    }

    const payload = {
      tid:   trackingId,
      event: eventName,
      vid:   VID,
      sid:   SID,
      url:   'https://mi-sitio-de-prueba.com/producto',
      email: eventName !== 'page_view' && email ? email : undefined,
      value: eventName === 'purchase' ? parseFloat(value) || undefined : undefined,
      order_id: eventName === 'purchase' && orderId ? orderId : (eventName === 'purchase' ? `sim-${Date.now()}` : undefined),
      props: {
        source,
        medium,
        utms: {
          utm_source:   source,
          utm_medium:   medium,
          utm_campaign: campaign,
          utm_term:     term    || undefined,
          utm_content:  content || undefined,
        },
      },
    };

    try {
      const res  = await fetch('/api/collect', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setResult({
          ok:  true,
          msg: `✅ ${LABELS[eventName]} enviada · ${source}/${medium} → ${campaign}${term ? ' → ' + term : ''}${content ? ' → ' + content : ''}${eventName === 'purchase' && value ? ' · $' + value : ''} · ID: ${json.id || '—'}`,
        });
      } else {
        setResult({ ok: false, msg: `❌ Error ${res.status}: ${json.error || 'desconocido'}` });
      }
    } catch (e: unknown) {
      setResult({ ok: false, msg: `❌ ${e instanceof Error ? e.message : 'Error de red'}` });
    }

    setLoading(false);
  }

  const inp = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 mb-3';
  const lbl = 'block text-xs font-medium text-slate-500 mb-1';

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">🧪 Simulador de eventos</h1>
      <p className="text-slate-500 text-sm mb-8">
        Probá el tracking sin necesitar un sitio real. Los datos aparecen en{' '}
        <a href="/campaigns" className="text-indigo-600 font-medium hover:underline">Campañas</a> al instante.
      </p>

      {/* UTM */}
      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-slate-800 mb-4">📢 Datos del anuncio</h2>
        <div className="grid grid-cols-2 gap-x-4">
          <div><label className={lbl}>Fuente</label><input className={inp} value={source}   onChange={e => setSource(e.target.value)}   placeholder="facebook" /></div>
          <div><label className={lbl}>Medio</label><input className={inp}  value={medium}   onChange={e => setMedium(e.target.value)}   placeholder="cpc" /></div>
        </div>
        <label className={lbl}>Campaña</label>
        <input className={inp} value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="nombre-campaña" />
        <label className={lbl}>Conjunto de anuncios</label>
        <input className={inp} value={term}     onChange={e => setTerm(e.target.value)}     placeholder="nombre-conjunto" />
        <label className={lbl}>Anuncio</label>
        <input className={inp} value={content}  onChange={e => setContent(e.target.value)}  placeholder="nombre-anuncio" />
      </div>

      {/* Buttons */}
      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-slate-800 mb-4">🚀 Enviar evento</h2>

        <button
          onClick={() => sendEvent('page_view')}
          disabled={loading}
          className="w-full mb-3 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          👁️ Simular visita
        </button>

        <hr className="border-slate-100 my-4" />

        <label className={lbl}>Email del lead (opcional)</label>
        <input className={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@ejemplo.com" />
        <button
          onClick={() => sendEvent('lead')}
          disabled={loading}
          className="w-full mb-3 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          👤 Simular lead
        </button>

        <hr className="border-slate-100 my-4" />

        <label className={lbl}>Valor de la compra (USD)</label>
        <input className={inp} type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="97" />
        <label className={lbl}>Order ID (opcional — auto-generado si vacío)</label>
        <input className={inp} value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="pi_3abc... o sim-12345" />
        <button
          onClick={() => sendEvent('purchase')}
          disabled={loading}
          className="w-full py-3 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          💰 Simular compra
        </button>

        {result && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${result.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {result.msg}
          </div>
        )}
      </div>
    </div>
  );
}
