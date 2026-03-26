import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CopySnippetButton } from './copy-button';
import { Code2, CheckCircle, Info } from 'lucide-react';

export default async function SnippetPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!workspace) redirect('/login');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tu-app.vercel.app';
  const snippet = `<!-- TrackerSaaS - First Party Tracking -->
<script src="${appUrl}/tracker.js" data-tid="${workspace.tracking_id}" async></script>`;

  const purchaseSnippet = `<!-- Llamar en tu página de confirmación de compra -->
<script>
  // Opción 1: URL automática (agrega ?order_id=xxx&value=99 a tu URL de gracias)
  // El tracker lo detecta automáticamente.

  // Opción 2: Manual
  tracker.purchase({
    orderId: 'ORD-12345',
    value: 99.00,
    currency: 'USD',
    email: 'cliente@email.com'
  });
</script>`;

  const leadSnippet = `<!-- Opción manual para trackear un lead -->
<script>
  tracker.lead({ email: 'cliente@email.com' });

  // O intégrate con tu formulario:
  document.getElementById('mi-form').addEventListener('submit', function(e) {
    var email = this.querySelector('[type="email"]').value;
    tracker.lead({ email: email });
  });
</script>`;

  const steps = [
    { n: 1, text: 'Copia el snippet de instalación', done: true },
    { n: 2, text: 'Pégalo antes de </head> en todas las páginas de tu sitio', done: false },
    { n: 3, text: 'Configura las integraciones (Meta, AC, Stripe)', done: false },
    { n: 4, text: 'Verifica los eventos en el panel de Eventos', done: false },
  ];

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Instalar Snippet</h1>
        <p className="text-slate-500 text-sm mt-1">
          Pega este código en tu web para empezar a trackear eventos first-party.
        </p>
      </div>

      {/* Steps */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-900 mb-3">Pasos de instalación</h2>
        <div className="space-y-2">
          {steps.map(step => (
            <div key={step.n} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                step.done ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {step.done ? <CheckCircle className="w-4 h-4" /> : step.n}
              </div>
              <span className="text-sm text-slate-700">{step.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tracking ID */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Code2 className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Tu Tracking ID</h2>
        </div>
        <code className="block bg-slate-900 text-green-400 px-4 py-3 rounded-lg font-mono text-sm">
          {workspace.tracking_id}
        </code>
      </div>

      {/* Main snippet */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-slate-900">Snippet de instalación</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pega esto antes de <code>&lt;/head&gt;</code> en tu sitio.</p>
          </div>
          <CopySnippetButton text={snippet} />
        </div>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono">
          {snippet}
        </pre>
      </div>

      {/* Events auto-tracked */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-900 mb-3">Eventos que se trackean automáticamente</h2>
        <div className="space-y-2 text-sm">
          {[
            { event: 'page_view', desc: 'Cada vez que alguien visita una página (incluyendo SPAs).' },
            { event: 'scroll_25/50/75/100', desc: 'Profundidad de scroll en 4 niveles.' },
            { event: 'lead', desc: 'Detección automática de formularios con campo email.' },
          ].map(item => (
            <div key={item.event} className="flex gap-3">
              <code className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded h-fit shrink-0">{item.event}</code>
              <span className="text-slate-600">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Purchase tracking */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-slate-900">Trackear compras (Purchase)</h2>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Recomendado via webhook</span>
        </div>
        <div className="flex gap-2 items-start mb-3 bg-blue-50 rounded-lg p-3">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            La forma más confiable es el <strong>webhook de Stripe</strong> (configurado en Integraciones).
            También puedes usar los métodos client-side:
          </p>
        </div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500">Código JS para tu página de confirmación:</p>
          <CopySnippetButton text={purchaseSnippet} label="Copiar" />
        </div>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono">
          {purchaseSnippet}
        </pre>
      </div>

      {/* Lead manual */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-slate-900">Trackear lead manualmente</h2>
            <p className="text-xs text-slate-500 mt-0.5">Para formularios personalizados o integraciones externas.</p>
          </div>
          <CopySnippetButton text={leadSnippet} label="Copiar" />
        </div>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono">
          {leadSnippet}
        </pre>
      </div>
    </div>
  );
}
