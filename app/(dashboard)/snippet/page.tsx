import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CopySnippetButton } from './copy-button';
import { CustomDomainSetup } from './custom-domain-setup';
import { Code2, CheckCircle, Info, ExternalLink } from 'lucide-react';

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

  const scriptBase = workspace.custom_domain
    ? `https://${workspace.custom_domain}`
    : appUrl;

  const snippet = `<!-- DIANA Tracking - First Party Tracking -->
<script src="${scriptBase}/tracker.js" data-tid="${workspace.tracking_id}" async></script>`;

  const purchaseSnippet = `<!-- Llamar en tu página de confirmación de compra -->
<script>
  tracker.purchase({
    orderId: 'ORD-12345',   // ID único del pedido
    value: 99.00,            // Monto de la venta
    currency: 'USD',
    email: 'cliente@email.com'
  });
</script>`;

  const leadSnippet = `<!-- Para trackear un lead manualmente -->
<script>
  // Opción A: al enviar un formulario
  document.getElementById('mi-formulario').addEventListener('submit', function(e) {
    var email = this.querySelector('[type="email"]').value;
    tracker.lead({ email: email });
  });

  // Opción B: llamada directa
  tracker.lead({ email: 'cliente@email.com' });
</script>`;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Instalar Snippet</h1>
        <p className="text-slate-500 text-sm mt-1">
          Seguí estos pasos para empezar a medir el tráfico y las conversiones de tu sitio.
        </p>
      </div>

      {/* ── Paso 1 ── */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: '#E53535' }}>
            1
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Copiá tu snippet de instalación</h2>
            <p className="text-xs text-slate-500 mt-0.5">Este código es único para tu cuenta.</p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
            <Code2 className="w-3.5 h-3.5" /> Tu Tracking ID
          </p>
          <code className="block bg-slate-900 text-green-400 px-4 py-2.5 rounded-lg font-mono text-sm">
            {workspace.tracking_id}
          </code>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">Snippet completo para pegar en tu web:</p>
            <CopySnippetButton text={snippet} />
          </div>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono">
            {snippet}
          </pre>
        </div>
      </div>

      {/* ── Paso 2 ── */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: '#E53535' }}>
            2
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Instalalo en tu sitio web</h2>
            <p className="text-xs text-slate-500 mt-0.5">El snippet debe estar en <strong>todas</strong> las páginas de tu sitio.</p>
          </div>
        </div>

        <div className="space-y-3">
          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
              <span className="font-medium text-sm text-slate-800">🟦 WordPress</span>
              <span className="text-xs text-slate-400 group-open:hidden">Ver pasos</span>
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 space-y-2 border-t border-slate-100 pt-3">
              <p><strong>Opción A — Plugin (más fácil):</strong></p>
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Instalá el plugin <strong>"Insert Headers and Footers"</strong> desde Plugins → Agregar nuevo.</li>
                <li>Andá a Ajustes → Insert Headers and Footers.</li>
                <li>Pegá el snippet en <strong>"Scripts in Header"</strong>.</li>
                <li>Guardá los cambios.</li>
              </ol>
              <p className="mt-2"><strong>Opción B — Editar el tema:</strong></p>
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Andá a Apariencia → Editor de archivos del tema.</li>
                <li>Abrí <code className="bg-slate-100 px-1 rounded">header.php</code>.</li>
                <li>Pegá el snippet justo antes de <code className="bg-slate-100 px-1 rounded">&lt;/head&gt;</code>.</li>
                <li>Guardá los cambios.</li>
              </ol>
            </div>
          </details>

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
              <span className="font-medium text-sm text-slate-800">🟢 Shopify</span>
              <span className="text-xs text-slate-400 group-open:hidden">Ver pasos</span>
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 space-y-1 border-t border-slate-100 pt-3">
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Panel de tu tienda → <strong>Canales de ventas → Tienda online → Temas</strong>.</li>
                <li>Tres puntos del tema activo → <strong>Editar código</strong>.</li>
                <li>En la carpeta <code className="bg-slate-100 px-1 rounded">Layout</code>, abrí <code className="bg-slate-100 px-1 rounded">theme.liquid</code>.</li>
                <li>Pegá el snippet antes de <code className="bg-slate-100 px-1 rounded">&lt;/head&gt;</code> y guardá.</li>
              </ol>
            </div>
          </details>

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
              <span className="font-medium text-sm text-slate-800">🔵 Wix / Squarespace / Webflow</span>
              <span className="text-xs text-slate-400 group-open:hidden">Ver pasos</span>
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 space-y-2 border-t border-slate-100 pt-3">
              <p><strong>Wix:</strong> Ajustes → Código personalizado → Head → Agregar código personalizado.</p>
              <p><strong>Squarespace:</strong> Diseño → Inyección de código → Encabezado.</p>
              <p><strong>Webflow:</strong> Configuración del proyecto → HTML personalizado → Head code.</p>
            </div>
          </details>

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
              <span className="font-medium text-sm text-slate-800">⚡ HTML / Otro</span>
              <span className="text-xs text-slate-400 group-open:hidden">Ver pasos</span>
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 border-t border-slate-100 pt-3">
              <p className="mb-2">Pegá el snippet antes de <code className="bg-slate-100 px-1 rounded">&lt;/head&gt;</code> en el HTML de cada página.</p>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs font-mono overflow-x-auto">{`<head>
  ...otros tags...
  <!-- DIANA Tracking -->
  <script src="..." async></script>
</head>`}</pre>
            </div>
          </details>
        </div>
      </div>

      {/* ── Paso 3 ── */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: '#E53535' }}>
            3
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Conectá tus integraciones</h2>
            <p className="text-xs text-slate-500 mt-0.5">Para que DIANA devuelva conversiones verificadas a tus plataformas de ads.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          Al conectar Meta, Google Ads o GoHighLevel, DIANA cruza los leads y compras con tu CRM y envía esa información de vuelta — así tus campañas aprenden de datos reales, no solo de clics.
        </p>
        <a
          href="/integrations"
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg text-white transition-colors"
          style={{ backgroundColor: '#E53535' }}
        >
          <ExternalLink className="w-4 h-4" />
          Ir a Integraciones
        </a>
      </div>

      {/* ── Paso 4 ── */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: '#E53535' }}>
            4
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Verificá que funciona</h2>
            <p className="text-xs text-slate-500 mt-0.5">Usá el Simulador para ver los datos en tiempo real.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          Andá al <strong>Simulador</strong> y hacé clic en "Simular visita". En segundos vas a ver el evento aparecer en el panel de Eventos.
        </p>
        <a
          href="/test"
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <CheckCircle className="w-4 h-4 text-green-500" />
          Ir al Simulador
        </a>
      </div>

      {/* ── Dominio Propio ── */}
      <CustomDomainSetup
        initialDomain={workspace.custom_domain ?? null}
        initialVerified={workspace.custom_domain_verified ?? false}
        trackingId={workspace.tracking_id}
        appUrl={appUrl}
      />

      {/* ── Eventos automáticos ── */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-900 mb-1">Eventos que se capturan automáticamente</h2>
        <p className="text-xs text-slate-500 mb-3">Sin configuración adicional, desde el momento en que instalás el snippet.</p>
        <div className="space-y-2 text-sm">
          {[
            { event: 'page_view', desc: 'Cada vez que alguien visita una página.' },
            { event: 'scroll_25/50/75/100', desc: 'Profundidad de scroll en 4 niveles.' },
            { event: 'lead', desc: 'Se detecta automáticamente cuando alguien llena un formulario con campo de email.' },
          ].map(item => (
            <div key={item.event} className="flex gap-3 items-start">
              <code className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded h-fit shrink-0 font-mono">{item.event}</code>
              <span className="text-slate-600">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Trackear compras ── */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="font-semibold text-slate-900">Trackear compras</h2>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Recomendado via webhook</span>
        </div>
        <div className="flex gap-2 items-start mb-3 bg-blue-50 rounded-lg p-3">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            <strong>La forma más confiable:</strong> conectar Stripe en Integraciones. DIANA recibe automáticamente cada pago confirmado y lo cruza con el lead correspondiente.
            Si usás otra plataforma de pagos, usá el código de abajo en tu página de "Gracias por tu compra".
          </p>
        </div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500">Código para tu página de confirmación:</p>
          <CopySnippetButton text={purchaseSnippet} label="Copiar" />
        </div>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono">
          {purchaseSnippet}
        </pre>
      </div>

      {/* ── Trackear leads manualmente ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold text-slate-900">Trackear leads manualmente</h2>
            <p className="text-xs text-slate-500 mt-0.5">Para formularios personalizados o páginas de registro.</p>
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
