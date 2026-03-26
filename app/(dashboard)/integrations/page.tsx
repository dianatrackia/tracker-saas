'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, XCircle, Loader2, Save, TestTube } from 'lucide-react';

interface IntegrationForm {
  meta: { pixel_id: string; access_token: string; test_event_code: string };
  activecampaign: { api_url: string; api_key: string };
  mailchimp: { api_key: string; list_id: string };
  stripe: { secret_key: string; webhook_secret: string };
}

const DEFAULT_FORM: IntegrationForm = {
  meta: { pixel_id: '', access_token: '', test_event_code: '' },
  activecampaign: { api_url: '', api_key: '' },
  mailchimp: { api_key: '', list_id: '' },
  stripe: { secret_key: '', webhook_secret: '' },
};

type IntegrationType = keyof IntegrationForm;
type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export default function IntegrationsPage() {
  const supabase = createClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [form, setForm] = useState<IntegrationForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState<Record<IntegrationType, boolean>>({
    meta: false, activecampaign: false, mailchimp: false, stripe: false,
  });
  const [testStatus, setTestStatus] = useState<Record<IntegrationType, TestStatus>>({
    meta: 'idle', activecampaign: 'idle', mailchimp: 'idle', stripe: 'idle',
  });
  const [testMsg, setTestMsg] = useState<Record<IntegrationType, string>>({
    meta: '', activecampaign: '', mailchimp: '', stripe: '',
  });
  const [integrationIds, setIntegrationIds] = useState<Record<IntegrationType, string | null>>({
    meta: null, activecampaign: null, mailchimp: null, stripe: null,
  });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: ws } = await supabase.from('workspaces').select('id').eq('user_id', user.id).single();
      if (ws) setWorkspaceId(ws.id);
    });
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    fetch('/api/integrations')
      .then(r => r.json())
      .then(({ integrations }) => {
        if (!integrations) return;
        const ids: Record<IntegrationType, string | null> = { meta: null, activecampaign: null, mailchimp: null, stripe: null };
        integrations.forEach((i: { id: string; type: IntegrationType }) => { ids[i.type] = i.id; });
        setIntegrationIds(ids);
      });
  }, [workspaceId]);

  function updateField(type: IntegrationType, field: string, value: string) {
    setForm(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  }

  async function saveIntegration(type: IntegrationType) {
    if (!workspaceId) return;
    setSaving(prev => ({ ...prev, [type]: true }));

    const res = await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        type,
        config: form[type],
        enabled: true,
      }),
    });

    const data = await res.json();
    if (data.integration) {
      setIntegrationIds(prev => ({ ...prev, [type]: data.integration.id }));
    }
    setSaving(prev => ({ ...prev, [type]: false }));
  }

  async function testIntegration(type: IntegrationType) {
    const id = integrationIds[type];
    if (!id) return;
    setTestStatus(prev => ({ ...prev, [type]: 'testing' }));
    setTestMsg(prev => ({ ...prev, [type]: '' }));

    const res = await fetch('/api/integrations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration_id: id }),
    });
    const data = await res.json();

    setTestStatus(prev => ({ ...prev, [type]: data.success ? 'success' : 'error' }));
    setTestMsg(prev => ({ ...prev, [type]: data.error || data.listName || data.accountName || '' }));
  }

  const IntegrationCard = ({
    type, title, description, logo, fields,
  }: {
    type: IntegrationType;
    title: string;
    description: string;
    logo: string;
    fields: { key: string; label: string; placeholder: string; type?: string }[];
  }) => (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{logo}</span>
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {integrationIds[type] && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">Configurado</span>
        )}
      </div>

      <div className="space-y-3">
        {fields.map(field => (
          <div key={field.key}>
            <label className="label">{field.label}</label>
            <input
              type={field.type || 'text'}
              value={(form[type] as Record<string, string>)[field.key] || ''}
              onChange={e => updateField(type, field.key, e.target.value)}
              className="input font-mono text-xs"
              placeholder={field.placeholder}
              autoComplete="off"
            />
          </div>
        ))}
      </div>

      {/* Test result */}
      {testStatus[type] !== 'idle' && (
        <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
          testStatus[type] === 'success' ? 'bg-green-50 text-green-700' :
          testStatus[type] === 'testing' ? 'bg-blue-50 text-blue-700' :
          'bg-red-50 text-red-700'
        }`}>
          {testStatus[type] === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {testStatus[type] === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
          {testStatus[type] === 'error' && <XCircle className="w-3.5 h-3.5" />}
          {testStatus[type] === 'testing' ? 'Probando conexión...' :
           testStatus[type] === 'success' ? `Conexión exitosa${testMsg[type] ? ` · ${testMsg[type]}` : ''}` :
           testMsg[type] || 'Error de conexión'}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => saveIntegration(type)}
          disabled={saving[type]}
          className="btn-primary"
        >
          {saving[type] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </button>
        {integrationIds[type] && (
          <button
            onClick={() => testIntegration(type)}
            disabled={testStatus[type] === 'testing'}
            className="btn-secondary"
          >
            {testStatus[type] === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
            Probar
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Integraciones</h1>
        <p className="text-slate-500 text-sm mt-1">
          Conecta tus plataformas para enviar eventos server-side y verificar conversiones.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IntegrationCard
          type="meta"
          title="Meta (Facebook) CAPI"
          description="Envía eventos server-side al pixel de Meta. Bypasea adblockers."
          logo="🎯"
          fields={[
            { key: 'pixel_id', label: 'Pixel ID', placeholder: '1234567890123456' },
            { key: 'access_token', label: 'Access Token', placeholder: 'EAAxxxxxxxx...', type: 'password' },
            { key: 'test_event_code', label: 'Test Event Code (opcional)', placeholder: 'TEST12345' },
          ]}
        />

        <IntegrationCard
          type="activecampaign"
          title="ActiveCampaign"
          description="Verifica leads contra tus contactos de AC."
          logo="📧"
          fields={[
            { key: 'api_url', label: 'API URL', placeholder: 'https://tuaccount.api-us1.com' },
            { key: 'api_key', label: 'API Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
          ]}
        />

        <IntegrationCard
          type="mailchimp"
          title="Mailchimp"
          description="Verifica que el lead esté suscrito en tu audiencia de Mailchimp."
          logo="🐵"
          fields={[
            { key: 'api_key', label: 'API Key', placeholder: 'abcdef1234567890-us21', type: 'password' },
            { key: 'list_id', label: 'Audience ID (List ID)', placeholder: 'abc1234def' },
          ]}
        />

        <IntegrationCard
          type="stripe"
          title="Stripe"
          description="Verifica compras contra tus PaymentIntents de Stripe."
          logo="💳"
          fields={[
            { key: 'secret_key', label: 'Secret Key', placeholder: 'sk_live_xxxxxxxxx', type: 'password' },
            { key: 'webhook_secret', label: 'Webhook Secret', placeholder: 'whsec_xxxxxxxxx', type: 'password' },
          ]}
        />
      </div>

      <div className="mt-6 card p-5 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-1">Webhook de Stripe</h3>
        <p className="text-sm text-blue-700">
          Para verificar compras automáticamente, configura un webhook en Stripe Dashboard apuntando a:
        </p>
        <code className="block mt-2 text-xs bg-blue-100 text-blue-800 px-3 py-2 rounded font-mono">
          {typeof window !== 'undefined' ? window.location.origin : 'https://tu-app.vercel.app'}/api/webhooks/stripe
        </code>
        <p className="text-xs text-blue-600 mt-1">
          Eventos: <code>payment_intent.succeeded</code>, <code>checkout.session.completed</code>.
          Agrega <code>metadata.tracker_tid = &quot;trk_XXXX&quot;</code> a tus PaymentIntents.
        </p>
      </div>
    </div>
  );
}
