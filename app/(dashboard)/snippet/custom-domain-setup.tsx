'use client';

import { useState } from 'react';
import { Globe, CheckCircle2, Clock, XCircle, Loader2, Trash2, ExternalLink } from 'lucide-react';

interface Props {
  initialDomain: string | null;
  initialVerified: boolean;
  trackingId: string;
  appUrl: string;
}

type VerifyStatus = 'idle' | 'loading' | 'active' | 'pending' | 'wrong_target' | 'error';

export function CustomDomainSetup({ initialDomain, initialVerified, trackingId, appUrl }: Props) {
  const [domain, setDomain] = useState(initialDomain || '');
  const [savedDomain, setSavedDomain] = useState(initialDomain || '');
  const [verified, setVerified] = useState(initialVerified);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>(
    initialVerified ? 'active' : initialDomain ? 'idle' : 'idle'
  );
  const [verifyMsg, setVerifyMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [vercelStatus, setVercelStatus] = useState<string>('');

  // ── Save domain ──────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    setVercelStatus('');
    try {
      const res = await fetch('/api/register-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error || 'Error al guardar');
        return;
      }
      setSavedDomain(domain.trim().toLowerCase());
      setVerified(false);
      setVerifyStatus('idle');
      if (json.vercelStatus === 'registered') {
        setVercelStatus('✅ Dominio registrado en Vercel automáticamente.');
      } else if (json.vercelStatus === 'manual') {
        setVercelStatus('ℹ️ Agrégalo manualmente en Vercel Dashboard → tu proyecto → Settings → Domains.');
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Remove domain ────────────────────────────────────────────────────────

  async function handleRemove() {
    if (!confirm('¿Eliminar el dominio personalizado?')) return;
    await fetch('/api/register-domain', { method: 'DELETE' });
    setSavedDomain('');
    setDomain('');
    setVerified(false);
    setVerifyStatus('idle');
    setVerifyMsg('');
    setVercelStatus('');
  }

  // ── Verify CNAME ─────────────────────────────────────────────────────────

  async function handleVerify() {
    if (!savedDomain) return;
    setVerifyStatus('loading');
    setVerifyMsg('');
    try {
      const res = await fetch(`/api/verify-domain?domain=${encodeURIComponent(savedDomain)}`);
      const json = await res.json();
      setVerifyStatus(json.status as VerifyStatus);
      setVerifyMsg(json.message || '');
      if (json.status === 'active') setVerified(true);
    } catch {
      setVerifyStatus('error');
      setVerifyMsg('No se pudo verificar. Intenta de nuevo.');
    }
  }

  // ── Snippet con custom domain ─────────────────────────────────────────────

  const effectiveDomain = savedDomain || appUrl.replace(/^https?:\/\//, '');
  const snippetSrc = savedDomain ? `https://${savedDomain}` : appUrl;
  const customSnippet = `<!-- DIANA Tracking - First Party Tracking -->
<script src="${snippetSrc}/tracker.js" data-tid="${trackingId}" async></script>`;

  // ── Status badge ─────────────────────────────────────────────────────────

  function StatusBadge() {
    if (verified || verifyStatus === 'active') {
      return (
        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
          <CheckCircle2 className="w-3 h-3" /> Activo
        </span>
      );
    }
    if (savedDomain && !verified) {
      return (
        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
          <Clock className="w-3 h-3" /> Pendiente de DNS
        </span>
      );
    }
    return null;
  }

  return (
    <div className="card p-5 mb-6 border-2 border-brand-200 bg-brand-50/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-600" />
          <div>
            <h2 className="font-semibold text-slate-900">Dominio Propio (First-Party real)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Como AnyTrack — el script corre desde <strong>tu dominio</strong>, invisible para adblockers.
            </p>
          </div>
        </div>
        <StatusBadge />
      </div>

      {/* Explanation */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 mb-4 text-xs text-slate-600 space-y-1">
        <p>
          <strong>¿Por qué importa?</strong> Sin un dominio propio, el script viene de{' '}
          <code className="bg-slate-100 px-1 rounded">tracker-saas.vercel.app</code> — un dominio ajeno al tuyo.
          Brave, Firefox y los filtros de uBlock pueden bloquearlo.
        </p>
        <p>
          Con un subdominio tuyo (ej. <code className="bg-slate-100 px-1 rounded">t.tudominio.com</code>), el
          browser lo ve como tráfico de tu propio sitio. Las cookies duran <strong>1 año en Safari</strong>{' '}
          en vez de 7 días, y ningún adblocker lo bloquea porque es tu dominio.
        </p>
      </div>

      {/* Domain input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder="track.tudominio.com"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={handleSave}
          disabled={saving || !domain.trim()}
          className="btn-primary text-sm px-4 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {savedDomain && (
          <button
            onClick={handleRemove}
            className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
            title="Eliminar dominio"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {saveError && (
        <p className="text-xs text-red-600 mb-3 flex items-center gap-1">
          <XCircle className="w-3 h-3" /> {saveError}
        </p>
      )}

      {vercelStatus && (
        <p className="text-xs text-slate-600 mb-3 bg-white rounded px-3 py-2 border border-slate-200">
          {vercelStatus}
        </p>
      )}

      {/* DNS instructions */}
      {savedDomain && (
        <div className="bg-slate-900 rounded-lg p-4 mb-3 text-xs font-mono">
          <p className="text-slate-400 mb-2">Agrega este registro DNS en tu proveedor:</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <span className="text-slate-400">Tipo</span>
            <span className="text-green-400">CNAME</span>
            <span className="text-slate-400">Host</span>
            <span className="text-green-400">{savedDomain.split('.')[0]}</span>
            <span className="text-slate-400">Valor</span>
            <span className="text-yellow-300">cname.vercel-dns.com</span>
            <span className="text-slate-400">TTL</span>
            <span className="text-green-400">3600 (o Auto)</span>
          </div>
          <p className="text-slate-500 mt-3 text-[11px]">
            * Cloudflare: desactiva el proxy (nube naranja → gris) para que el CNAME propague correctamente.
          </p>
        </div>
      )}

      {/* Verify button */}
      {savedDomain && !verified && (
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={handleVerify}
            disabled={verifyStatus === 'loading'}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {verifyStatus === 'loading'
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Verificando DNS…</>
              : '🔍 Verificar CNAME'
            }
          </button>
          {verifyStatus === 'pending' && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <Clock className="w-3 h-3" /> DNS no propagado aún. Puede tardar hasta 48h.
            </span>
          )}
          {verifyStatus === 'wrong_target' && (
            <span className="text-xs text-red-600 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> {verifyMsg}
            </span>
          )}
          {verifyStatus === 'error' && (
            <span className="text-xs text-red-600">{verifyMsg}</span>
          )}
        </div>
      )}

      {(verified || verifyStatus === 'active') && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-xs text-green-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
          <div>
            <p className="font-semibold">¡Dominio activo!</p>
            <p className="mt-0.5">
              Ahora el script corre desde <strong>{savedDomain}</strong> — 100% first-party.
              Las cookies duran 1 año en Safari y los adblockers no pueden bloquearlo.
            </p>
          </div>
        </div>
      )}

      {/* Updated snippet */}
      {savedDomain && (
        <div>
          <p className="text-xs text-slate-500 mb-2 font-medium">
            Snippet actualizado con tu dominio:
          </p>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono">
            {customSnippet}
          </pre>
        </div>
      )}
    </div>
  );
}
