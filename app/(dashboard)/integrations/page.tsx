'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle, XCircle, Loader2, Save, TestTube,
  ExternalLink, Plug, Unplug, ChevronDown, Info,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface IntegrationMeta {
  id: string;
  type: string;
  enabled: boolean;
  display_name: string | null;
  connection_method: 'oauth' | 'api_key';
  last_tested: string | null;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

function IntegrationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, IntegrationMeta>>({});
  const [loading, setLoading] = useState(true);

  const connectedParam = searchParams.get('connected');
  const connectedName  = searchParams.get('name');
  const errorParam     = searchParams.get('error');

  const [manualForm, setManualForm] = useState<Record<string, Record<string, string>>>({
    meta:             { pixel_id: '', access_token: '', test_event_code: '' },
    activecampaign:   { account: '', api_key: '' },
    mailchimp:        { api_key: '', list_id: '' },
    stripe:           { secret_key: '', webhook_secret: '' },
    google_ads:       { customer_id: '', developer_token: '', conversion_action: '' },
    gohighlevel:      { api_key: '', location_id: '' },
  });
  const [saving, setSaving]         = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [testMsg, setTestMsg]       = useState<Record<string, string>>({});

  const [mcLists, setMcLists]         = useState<{ id: string; name: string; stats: { member_count: number } }[]>([]);
  const [mcListsOpen, setMcListsOpen] = useState(false);
  const [mcSaving, setMcSaving]       = useState(false);

  const loadIntegrations = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ws } = await supabase.from('workspaces').select('id').eq('user_id', user.id).single();
    if (ws) setWorkspaceId(ws.id);

    const res  = await fetch('/api/integrations');
    const json = await res.json() as { integrations?: IntegrationMeta[] };
    const map: Record<string, IntegrationMeta> = {};
    json.integrations?.forEach(i => { map[i.type] = i; });
    setIntegrations(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  useEffect(() => {
    if (connectedParam || errorParam) {
      const t = setTimeout(() => router.replace('/integrations'), 5000);
      return () => clearTimeout(t);
    }
  }, [connectedParam, errorParam, router]);

  function updateField(type: string, field: string, value: string) {
    setManualForm(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  }

  async function saveManual(type: string) {
    if (!workspaceId) return;
    setSaving(prev => ({ ...prev, [type]: true }));
    let config = { ...manualForm[type] };

    if (type === 'activecampaign' && config.account) {
      config = {
        api_url: `https://${config.account}.api-us1.com`,
        api_key: config.api_key,
        connection_method: 'api_key',
        display_name: `${config.account}.activehosted.com`,
      };
    } else if (type === 'google_ads') {
      config = {
        customer_id: config.customer_id.replace(/-/g, ''),
        developer_token: config.developer_token,
        conversion_action: config.conversion_action,
        connection_method: 'api_key',
        display_name: `Google Ads · ${config.customer_id}`,
      };
    } else if (type === 'gohighlevel') {
      config = {
        api_key: config.api_key,
        location_id: config.location_id,
        connection_method: 'api_key',
        display_name: `GoHighLevel · ${config.location_id}`,
      };
    } else {
      config = { ...config, connection_method: 'api_key' };
    }

    const res = await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, type, config, enabled: true }),
    });
    if (res.ok) await loadIntegrations();
    setSaving(prev => ({ ...prev, [type]: false }));
  }

  async function testIntegration(type: string) {
    const id = integrations[type]?.id;
    if (!id) return;
    setTestStatus(prev => ({ ...prev, [type]: 'testing' }));
    setTestMsg(prev => ({ ...prev, [type]: '' }));

    const res  = await fetch('/api/integrations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration_id: id }),
    });
    const data = await res.json() as { success: boolean; error?: string; listName?: string; accountName?: string; pixelName?: string };
    setTestStatus(prev => ({ ...prev, [type]: data.success ? 'success' : 'error' }));
    setTestMsg(prev => ({
      ...prev,
      [type]: data.error || data.listName || data.accountName || data.pixelName || '',
    }));
  }

  async function disconnect(type: string) {
    const id = integrations[type]?.id;
    if (!id) return;
    await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        type,
        config: { connection_method: 'api_key' },
        enabled: false,
      }),
    });
    await loadIntegrations();
  }

  async function loadMcLists() {
    const res  = await fetch('/api/oauth/mailchimp/lists');
    const data = await res.json() as { lists?: typeof mcLists };
    setMcLists(data.lists || []);
    setMcListsOpen(true);
  }

  async function selectMcList(id: string, name: string) {
    setMcSaving(true);
    await fetch('/api/oauth/mailchimp/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_id: id, list_name: name }),
    });
    await loadIntegrations();
    setMcListsOpen(false);
    setMcSaving(false);
  }

  // ── Sub-components ────────────────────────────────────────────────────
  const StatusBadge = ({ type }: { type: string }) => {
    const integ = integrations[type];
    if (!integ || !integ.enabled) return null;
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
        <CheckCircle className="w-3 h-3" /> Conectado
      </span>
    );
  };

  const TestRow = ({ type }: { type: string }) => {
    const status = testStatus[type] || 'idle';
    const msg    = testMsg[type] || '';
    if (status === 'idle') return null;
    return (
      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mt-3 ${
        status === 'success' ? 'bg-green-50 text-green-700' :
        status === 'testing' ? 'bg-blue-50 text-blue-700'  :
        'bg-red-50 text-red-700'
      }`}>
        {status === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {status === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
        {status === 'error'   && <XCircle className="w-3.5 h-3.5" />}
        {status === 'testing' ? 'Probando conexión...' :
         status === 'success' ? `Conexión exitosa${msg ? ` · ${msg}` : ''}` :
         msg || 'Error de conexión'}
      </div>
    );
  };

  const ActionButtons = ({ type }: { type: string }) => {
    const connected = !!integrations[type]?.enabled;
    return (
      <div className="flex gap-2 mt-4">
        {connected && (
          <button
            onClick={() => testIntegration(type)}
            disabled={testStatus[type] === 'testing'}
            className="btn-secondary"
          >
            {testStatus[type] === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
            Probar
          </button>
        )}
        {connected && (
          <button onClick={() => disconnect(type)} className="btn-secondary text-red-500 hover:text-red-700">
            <Unplug className="w-4 h-4" /> Desconectar
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Integraciones</h1>
        <p className="text-slate-500 text-sm mt-1">
          Conectá tus plataformas para que DIANA devuelva conversiones reales verificadas por tu CRM.
        </p>
      </div>

      {/* OAuth callback notification */}
      {connectedParam && (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium">
          <CheckCircle className="w-4 h-4 text-green-600" />
          {connectedParam === 'stripe'    ? '¡Stripe conectado!' :
           connectedParam === 'mailchimp' ? '¡Mailchimp conectado!' : '¡Integración conectada!'}
          {connectedName && <span className="text-green-600 font-normal">· {decodeURIComponent(connectedName)}</span>}
        </div>
      )}
      {errorParam && (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          <XCircle className="w-4 h-4 text-red-500" />
          {errorParam === 'stripe_not_configured'    ? 'Stripe Connect no está configurado en el servidor.' :
           errorParam === 'mailchimp_not_configured' ? 'Mailchimp OAuth no está configurado en el servidor.' :
           errorParam === 'stripe_denied'            ? 'Conexión con Stripe cancelada.' :
           errorParam === 'mailchimp_denied'         ? 'Conexión con Mailchimp cancelada.' :
           'Hubo un error al conectar. Intenta de nuevo.'}
        </div>
      )}

      {/* ── Sección: Plataformas de Ads ─────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Plataformas de publicidad</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">

        {/* ── META CAPI ─────────────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎯</span>
              <div>
                <h3 className="font-semibold text-slate-900">Meta (Facebook) CAPI</h3>
                <p className="text-xs text-slate-500">Conversiones server-side · bypasea adblockers</p>
              </div>
            </div>
            <StatusBadge type="meta" />
          </div>

          {integrations.meta?.enabled ? (
            <div>
              {integrations.meta.display_name && (
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-medium">Pixel:</span> {integrations.meta.display_name}
                </p>
              )}

              {/* Lead Ads info */}
              <details className="mb-3 border border-amber-200 rounded-lg bg-amber-50">
                <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none text-sm font-medium text-amber-800">
                  <Info className="w-4 h-4 shrink-0" />
                  ¿Tenés campañas de formulario directo (Lead Ads)?
                </summary>
                <div className="px-3 pb-3 text-xs text-amber-900 space-y-2 border-t border-amber-200 pt-2">
                  <p>
                    Los <strong>Lead Ads de Meta</strong> (formularios que se abren dentro de Facebook/Instagram) <strong>no pasan por tu sitio web</strong>, por lo que el snippet no los captura automáticamente.
                  </p>
                  <p>Para capturarlos, configurá un webhook de leads de Meta que apunte a:</p>
                  <code className="block bg-white border border-amber-200 px-2 py-1.5 rounded text-xs font-mono break-all">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/meta-leads
                  </code>
                  <p className="text-amber-700">
                    Hacé esto en Meta Business Suite → Todas las herramientas → Leads Center → Webhooks. Una vez configurado, DIANA recibirá los leads y los enviará de vuelta a CAPI para cerrar el ciclo de atribución.
                  </p>
                </div>
              </details>

              <TestRow type="meta" />
              <ActionButtons type="meta" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 items-start bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                <Info className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
                <p>DIANA envía los eventos de conversión directamente a Meta desde el servidor, sin depender del pixel del navegador. Esto mejora la atribución y bypasea adblockers.</p>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">1</span>
                <div className="flex-1">
                  <label className="label">Pixel ID</label>
                  <input
                    type="text"
                    value={manualForm.meta?.pixel_id || ''}
                    onChange={e => updateField('meta', 'pixel_id', e.target.value)}
                    className="input font-mono text-xs"
                    placeholder="1234567890123456"
                  />
                  <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                    <ExternalLink className="w-3 h-3" /> Encontralo en Events Manager → Orígenes de datos
                  </a>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">2</span>
                <div className="flex-1">
                  <label className="label">Access Token (CAPI)</label>
                  <input
                    type="password"
                    value={manualForm.meta?.access_token || ''}
                    onChange={e => updateField('meta', 'access_token', e.target.value)}
                    className="input font-mono text-xs"
                    placeholder="EAAxxxxxxxx..."
                  />
                  <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                    <ExternalLink className="w-3 h-3" /> Events Manager → Tu Pixel → Configuración → Generar token de acceso
                  </a>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">3</span>
                <div className="flex-1">
                  <label className="label">Código de evento de prueba <span className="text-slate-400 font-normal">(opcional)</span></label>
                  <input
                    type="text"
                    value={manualForm.meta?.test_event_code || ''}
                    onChange={e => updateField('meta', 'test_event_code', e.target.value)}
                    className="input font-mono text-xs"
                    placeholder="TEST12345"
                  />
                  <p className="text-xs text-slate-400 mt-1">Solo para pruebas. Quitarlo antes de activar en producción.</p>
                </div>
              </div>

              <button
                onClick={() => saveManual('meta')}
                disabled={saving.meta || !manualForm.meta?.pixel_id || !manualForm.meta?.access_token}
                className="btn-primary w-full"
              >
                {saving.meta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                Conectar Meta CAPI
              </button>
              <TestRow type="meta" />
            </div>
          )}
        </div>

        {/* ── GOOGLE ADS ────────────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔵</span>
              <div>
                <h3 className="font-semibold text-slate-900">Google Ads</h3>
                <p className="text-xs text-slate-500">Conversiones offline · devuelve leads reales verificados</p>
              </div>
            </div>
            <StatusBadge type="google_ads" />
          </div>

          {integrations.google_ads?.enabled ? (
            <div>
              {integrations.google_ads.display_name && (
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-medium">Cuenta:</span> {integrations.google_ads.display_name}
                </p>
              )}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 mb-3">
                <p>DIANA captura el <code className="bg-blue-100 px-1 rounded">gclid</code> de los visitantes que llegan desde Google Ads y envía de vuelta las conversiones verificadas como <strong>conversiones offline</strong>.</p>
              </div>
              <TestRow type="google_ads" />
              <ActionButtons type="google_ads" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 items-start bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                <Info className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
                <p>Cuando alguien hace clic en tu anuncio, DIANA captura el ID del clic (gclid). Cuando ese lead se convierte en cliente real (verificado por tu CRM), DIANA se lo informa a Google Ads para mejorar la optimización de tus campañas.</p>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">1</span>
                <div className="flex-1">
                  <label className="label">ID de cliente de Google Ads</label>
                  <input
                    type="text"
                    value={manualForm.google_ads?.customer_id || ''}
                    onChange={e => updateField('google_ads', 'customer_id', e.target.value)}
                    className="input font-mono text-xs"
                    placeholder="123-456-7890"
                  />
                  <p className="text-xs text-slate-400 mt-1">Está en la esquina superior derecha de tu cuenta de Google Ads.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">2</span>
                <div className="flex-1">
                  <label className="label">Developer Token</label>
                  <input
                    type="password"
                    value={manualForm.google_ads?.developer_token || ''}
                    onChange={e => updateField('google_ads', 'developer_token', e.target.value)}
                    className="input font-mono text-xs"
                    placeholder="ABcDeFgHiJkLmN..."
                  />
                  <a href="https://developers.google.com/google-ads/api/docs/get-started/dev-token" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                    <ExternalLink className="w-3 h-3" /> Cómo obtener un Developer Token
                  </a>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">3</span>
                <div className="flex-1">
                  <label className="label">Nombre de la acción de conversión</label>
                  <input
                    type="text"
                    value={manualForm.google_ads?.conversion_action || ''}
                    onChange={e => updateField('google_ads', 'conversion_action', e.target.value)}
                    className="input text-xs"
                    placeholder="Lead verificado"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    El nombre exacto de la conversión en Google Ads. Creala en Herramientas → Conversiones → Nueva acción de conversión → Importar.
                  </p>
                </div>
              </div>

              <button
                onClick={() => saveManual('google_ads')}
                disabled={saving.google_ads || !manualForm.google_ads?.customer_id || !manualForm.google_ads?.developer_token || !manualForm.google_ads?.conversion_action}
                className="btn-primary w-full"
              >
                {saving.google_ads ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                Conectar Google Ads
              </button>
              <TestRow type="google_ads" />
            </div>
          )}
        </div>

      </div>

      {/* ── Sección: CRMs ───────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">CRM y automatizaciones</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">

        {/* ── GOHIGHLEVEL ───────────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <h3 className="font-semibold text-slate-900">GoHighLevel</h3>
                <p className="text-xs text-slate-500">Sincroniza contactos y dispara automatizaciones</p>
              </div>
            </div>
            <StatusBadge type="gohighlevel" />
          </div>

          {integrations.gohighlevel?.enabled ? (
            <div>
              {integrations.gohighlevel.display_name && (
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-medium">Cuenta:</span> {integrations.gohighlevel.display_name}
                </p>
              )}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 mb-3">
                <p>DIANA crea o actualiza contactos en GHL cuando se captura un lead, y envía el evento de conversión cuando se verifica una compra o cierre real.</p>
              </div>
              <TestRow type="gohighlevel" />
              <ActionButtons type="gohighlevel" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 items-start bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                <Info className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
                <p>Cada lead capturado por DIANA se crea como contacto en GoHighLevel. Cuando el contacto cierra (compra o calificación verificada), DIANA dispara el tag o workflow que definas.</p>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">1</span>
                <div className="flex-1">
                  <label className="label">API Key de GoHighLevel</label>
                  <input
                    type="password"
                    value={manualForm.gohighlevel?.api_key || ''}
                    onChange={e => updateField('gohighlevel', 'api_key', e.target.value)}
                    className="input font-mono text-xs"
                    placeholder="eyJhbGciOi..."
                  />
                  <a href="https://app.gohighlevel.com/settings/api_key" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                    <ExternalLink className="w-3 h-3" /> Ajustes → API Key en GoHighLevel
                  </a>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">2</span>
                <div className="flex-1">
                  <label className="label">Location ID (sub-cuenta)</label>
                  <input
                    type="text"
                    value={manualForm.gohighlevel?.location_id || ''}
                    onChange={e => updateField('gohighlevel', 'location_id', e.target.value)}
                    className="input font-mono text-xs"
                    placeholder="Ve8xxxxxxxxxxxxxxx"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    En GHL: andá a tu sub-cuenta → Ajustes → Info del negocio → Location ID (aparece al pie de la página).
                  </p>
                </div>
              </div>

              <button
                onClick={() => saveManual('gohighlevel')}
                disabled={saving.gohighlevel || !manualForm.gohighlevel?.api_key || !manualForm.gohighlevel?.location_id}
                className="btn-primary w-full"
              >
                {saving.gohighlevel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                Conectar GoHighLevel
              </button>
              <TestRow type="gohighlevel" />
            </div>
          )}
        </div>

        {/* ── ACTIVE CAMPAIGN ───────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📧</span>
              <div>
                <h3 className="font-semibold text-slate-900">ActiveCampaign</h3>
                <p className="text-xs text-slate-500">Verifica contactos y dispara automatizaciones</p>
              </div>
            </div>
            <StatusBadge type="activecampaign" />
          </div>

          {integrations.activecampaign?.enabled ? (
            <div>
              {integrations.activecampaign.display_name && (
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-medium">Cuenta:</span> {integrations.activecampaign.display_name}
                </p>
              )}
              <TestRow type="activecampaign" />
              <ActionButtons type="activecampaign" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">1</span>
                <div className="flex-1">
                  <label className="label">Nombre de tu cuenta en ActiveCampaign</label>
                  <input
                    type="text"
                    value={manualForm.activecampaign?.account || ''}
                    onChange={e => updateField('activecampaign', 'account', e.target.value)}
                    className="input"
                    placeholder="miempresa"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Es la primera parte de tu URL:{' '}
                    <span className="font-mono bg-slate-100 px-1 rounded">
                      {manualForm.activecampaign?.account || 'miempresa'}.activehosted.com
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">2</span>
                <div className="flex-1">
                  <label className="label">API Key</label>
                  <input
                    type="password"
                    value={manualForm.activecampaign?.api_key || ''}
                    onChange={e => updateField('activecampaign', 'api_key', e.target.value)}
                    className="input font-mono text-xs"
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  {manualForm.activecampaign?.account ? (
                    <a href={`https://${manualForm.activecampaign.account}.activehosted.com/app/settings/developer`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                      <ExternalLink className="w-3 h-3" /> Ir a Configuración → Developer para copiar tu API Key
                    </a>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">En ActiveCampaign: Configuración → Developer → API Access</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => saveManual('activecampaign')}
                disabled={saving.activecampaign || !manualForm.activecampaign?.account || !manualForm.activecampaign?.api_key}
                className="btn-primary w-full"
              >
                {saving.activecampaign ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                Conectar ActiveCampaign
              </button>
              <TestRow type="activecampaign" />
            </div>
          )}
        </div>

      </div>

      {/* ── Sección: Pagos ──────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Plataformas de pago</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── STRIPE ───────────────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💳</span>
              <div>
                <h3 className="font-semibold text-slate-900">Stripe</h3>
                <p className="text-xs text-slate-500">Verifica compras en tiempo real</p>
              </div>
            </div>
            <StatusBadge type="stripe" />
          </div>

          {integrations.stripe?.enabled ? (
            <div>
              {integrations.stripe.display_name && (
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-medium">Cuenta:</span> {integrations.stripe.display_name}
                </p>
              )}
              {integrations.stripe.connection_method === 'oauth' && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3 text-xs text-blue-700">
                  <p className="font-medium mb-1">⚡ Conectado via OAuth — mínimos permisos</p>
                  <p>Solo tiene acceso de lectura a tus PaymentIntents.</p>
                </div>
              )}
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 mb-1">
                <p className="font-medium text-slate-700 mb-1">Webhook para verificación en tiempo real (opcional)</p>
                <code className="text-[10px] break-all text-slate-500">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/stripe
                </code>
                <p className="mt-1 text-slate-400">
                  Eventos: <code>payment_intent.succeeded</code>, <code>checkout.session.completed</code>
                </p>
              </div>
              <TestRow type="stripe" />
              <ActionButtons type="stripe" />
            </div>
          ) : (
            <div className="space-y-3">
              <a href="/api/oauth/stripe"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#635BFF] hover:bg-[#4F46E5] text-white rounded-lg font-medium text-sm transition-colors">
                <Plug className="w-4 h-4" /> Conectar con Stripe
              </a>
              <p className="text-xs text-center text-slate-400">
                Serás redirigido a Stripe para autorizar el acceso de solo lectura.
              </p>
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer hover:text-slate-600">¿Preferís ingresar la clave manualmente?</summary>
                <div className="mt-2 space-y-2 pt-2 border-t border-slate-100">
                  {[
                    { key: 'secret_key', label: 'Secret Key', placeholder: 'sk_live_xxxxxxxx', type: 'password' },
                    { key: 'webhook_secret', label: 'Webhook Secret (opcional)', placeholder: 'whsec_xxxxxxxx', type: 'password' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="label text-xs">{f.label}</label>
                      <input type={f.type || 'text'}
                        onChange={e => setManualForm(prev => ({ ...prev, stripe: { ...prev.stripe, [f.key]: e.target.value } }))}
                        className="input font-mono text-xs" placeholder={f.placeholder} />
                    </div>
                  ))}
                  <button onClick={() => saveManual('stripe')} disabled={saving.stripe} className="btn-primary text-xs">
                    {saving.stripe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Guardar clave
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>

        {/* ── MAILCHIMP ─────────────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🐵</span>
              <div>
                <h3 className="font-semibold text-slate-900">Mailchimp</h3>
                <p className="text-xs text-slate-500">Verifica suscriptores de tu audiencia</p>
              </div>
            </div>
            <StatusBadge type="mailchimp" />
          </div>

          {integrations.mailchimp?.enabled ? (
            <div>
              {integrations.mailchimp.display_name && (
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-medium">Audiencia:</span> {integrations.mailchimp.display_name}
                </p>
              )}
              {integrations.mailchimp.connection_method === 'oauth' && (
                <>
                  <button onClick={() => mcListsOpen ? setMcListsOpen(false) : loadMcLists()}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline mb-3">
                    <ChevronDown className="w-3 h-3" /> Cambiar audiencia
                  </button>
                  {mcListsOpen && (
                    <div className="mb-3 border border-slate-200 rounded-lg overflow-hidden text-sm">
                      {mcLists.map(l => (
                        <button key={l.id} onClick={() => selectMcList(l.id, l.name)} disabled={mcSaving}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0">
                          <span className="font-medium text-slate-800">{l.name}</span>
                          <span className="text-xs text-slate-400">{l.stats?.member_count?.toLocaleString()} contactos</span>
                        </button>
                      ))}
                      {mcSaving && <div className="px-3 py-2 text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Guardando...</div>}
                    </div>
                  )}
                </>
              )}
              <TestRow type="mailchimp" />
              <ActionButtons type="mailchimp" />
            </div>
          ) : (
            <div className="space-y-3">
              <a href="/api/oauth/mailchimp"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#FFE01B] hover:bg-[#f0d000] text-slate-900 rounded-lg font-medium text-sm transition-colors">
                <Plug className="w-4 h-4" /> Conectar con Mailchimp
              </a>
              <p className="text-xs text-center text-slate-400">Autorizás el acceso a tus audiencias. Podés elegir cuál usar.</p>
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer hover:text-slate-600">¿Preferís ingresar la API Key manualmente?</summary>
                <div className="mt-2 space-y-2 pt-2 border-t border-slate-100">
                  {[
                    { key: 'api_key', label: 'API Key', placeholder: 'abc123def-us21', type: 'password' },
                    { key: 'list_id', label: 'Audience ID', placeholder: 'abc1234def' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="label text-xs">{f.label}</label>
                      <input type={f.type || 'text'}
                        onChange={e => setManualForm(prev => ({ ...prev, mailchimp: { ...prev.mailchimp, [f.key]: e.target.value } }))}
                        className="input font-mono text-xs" placeholder={f.placeholder} />
                    </div>
                  ))}
                  <button onClick={() => saveManual('mailchimp')} disabled={saving.mailchimp} className="btn-primary text-xs">
                    {saving.mailchimp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Guardar
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="p-8 flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    }>
      <IntegrationsContent />
    </Suspense>
  );
}
