import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CopySnippetButton } from './copy-button';
import { CustomDomainSetup } from './custom-domain-setup';
import { CheckCircle2, Circle, ExternalLink, Globe, Plug, TestTube, ChevronDown } from 'lucide-react';

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

  // Check if any integration is active
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id')
    .eq('workspace_id', workspace.id)
    .eq('enabled', true)
    .limit(1);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tu-app.vercel.app';
  const scriptBase = workspace.custom_domain ? `https://${workspace.custom_domain}` : appUrl;

  // The snippet — tracking_id is embedded automatically, user doesn't need to see it separately
  const snippet = `<!-- DIANA Tracking -->
<script src="${scriptBase}/tracker.js" data-tid="${workspace.tracking_id}" async></script>`;

  // Status checks for progress indicator
  const domainActive = workspace.custom_domain_verified === true;
  const hasIntegration = (integrations?.length ?? 0) > 0;

  // Advanced snippets (hidden by default)
  const purchaseSnippet = `<!-- Pegar en tu página "Gracias por tu compra" -->
<script>
  tracker.purchase({
    orderId: 'ORD-12345',
    value: 99.00,
    currency: 'USD',
    email: 'cliente@email.com'
  });
</script>`;

  const leadSnippet = `<!-- Para formularios con lógica personalizada -->
<script>
  document.getElementById('mi-form').addEventListener('submit', function(e) {
    var email = this.querySelector('[type="email"]').value;
    tracker.lead({ email: email });
  });
</script>`;

  return (
    <div className="p-8 max-w-2xl">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Instalación</h1>
        <p className="text-slate-500 text-sm mt-1">
          Seguí estos 4 pasos para empezar a recibir datos de tu sitio.
        </p>
      </div>

      {/* ── Progress overview ────────────────────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Tu progreso</p>
        <div className="space-y-2.5">
          {[
            { label: 'Snippet instalado en tu web', done: false, note: 'Confirmalo con el Paso 4' },
            { label: 'Dominio first-party activado', done: domainActive },
            { label: 'Al menos una integración conectada', done: hasIntegration },
            { label: 'Verificación completada', done: false, note: 'Usá el Simulador' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {item.done
                ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                : <Circle className="w-4 h-4 text-slate-300 shrink-0" />
              }
              <span className={`text-sm ${item.done ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                {item.label}
              </span>
              {item.note && !item.done && (
                <span className="text-xs text-slate-400 hidden sm:inline">— {item.note}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PASO 1 — Copiar e instalar el snippet
      ══════════════════════════════════════════════════════════════════ */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: '#E53535' }}
          >1</div>
          <div>
            <h2 className="font-semibold text-slate-900">Instalá el snippet en tu sitio</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>Obligatorio</strong> · Va en el <code className="bg-slate-100 px-1 rounded">&lt;head&gt;</code> de <strong>todas</strong> las páginas de tu sitio.
            </p>
          </div>
        </div>

        {/* The snippet to copy */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-600">Tu código único de instalación:</p>
            <CopySnippetButton text={snippet} />
          </div>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
            {snippet}
          </pre>
          <p className="text-xs text-slate-400 mt-2">
            Este código está configurado para tu cuenta — copialo y pegalo, no necesitás cambiar nada.
          </p>
        </div>

        {/* Platform instructions */}
        <p className="text-sm font-medium text-slate-700 mb-3">¿Dónde pegarlo según tu plataforma?</p>
        <div className="space-y-2">

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none">
              <span className="font-medium text-sm text-slate-800">🟦 WordPress</span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 space-y-3 border-t border-slate-100 pt-3">
              <div>
                <p className="font-medium text-slate-700 mb-1">Opción recomendada — plugin gratuito:</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Andá a <strong>Plugins → Agregar nuevo</strong>.</li>
                  <li>Buscá <strong>"Insert Headers and Footers"</strong> e instalalo.</li>
                  <li>Andá a <strong>Ajustes → Insert Headers and Footers</strong>.</li>
                  <li>Pegá el snippet en la caja <strong>"Scripts in Header"</strong>.</li>
                  <li>Hacé clic en <strong>Guardar</strong>.</li>
                </ol>
              </div>
              <div>
                <p className="font-medium text-slate-700 mb-1">Opción alternativa — editar el tema:</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Andá a <strong>Apariencia → Editor de archivos del tema</strong>.</li>
                  <li>Abrí <code className="bg-slate-100 px-1 rounded">header.php</code>.</li>
                  <li>Pegá el snippet antes de <code className="bg-slate-100 px-1 rounded">&lt;/head&gt;</code>.</li>
                  <li>Hacé clic en <strong>Actualizar archivo</strong>.</li>
                </ol>
              </div>
            </div>
          </details>

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none">
              <span className="font-medium text-sm text-slate-800">🟢 Shopify</span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 border-t border-slate-100 pt-3">
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>En tu panel andá a <strong>Canales de ventas → Tienda online → Temas</strong>.</li>
                <li>Clic en los tres puntos del tema activo → <strong>Editar código</strong>.</li>
                <li>En la carpeta <strong>Layout</strong>, abrí <code className="bg-slate-100 px-1 rounded">theme.liquid</code>.</li>
                <li>Pegá el snippet antes de <code className="bg-slate-100 px-1 rounded">&lt;/head&gt;</code>.</li>
                <li>Hacé clic en <strong>Guardar</strong>.</li>
              </ol>
            </div>
          </details>

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none">
              <span className="font-medium text-sm text-slate-800">🔵 Wix</span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 border-t border-slate-100 pt-3">
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Andá a <strong>Configuración → Código personalizado</strong>.</li>
                <li>En la sección <strong>Head</strong>, clic en <strong>+ Agregar código personalizado</strong>.</li>
                <li>Pegá el snippet y configurá para que aparezca en <strong>Todas las páginas</strong>.</li>
                <li>Hacé clic en <strong>Aplicar</strong>.</li>
              </ol>
            </div>
          </details>

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none">
              <span className="font-medium text-sm text-slate-800">🟣 Squarespace</span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 border-t border-slate-100 pt-3">
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Andá a <strong>Diseño → Inyección de código</strong>.</li>
                <li>Pegá el snippet en la caja <strong>Encabezado (Header)</strong>.</li>
                <li>Hacé clic en <strong>Guardar</strong>.</li>
              </ol>
            </div>
          </details>

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none">
              <span className="font-medium text-sm text-slate-800">⚡ Webflow</span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 border-t border-slate-100 pt-3">
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Andá a <strong>Configuración del proyecto → Custom Code</strong>.</li>
                <li>Pegá el snippet en la caja <strong>Head Code</strong>.</li>
                <li>Clic en <strong>Save Changes</strong> y republicá el sitio.</li>
              </ol>
            </div>
          </details>

          <details className="group border border-slate-200 rounded-lg">
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none">
              <span className="font-medium text-sm text-slate-800">🖥 HTML / Otro</span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600 border-t border-slate-100 pt-3">
              <p className="mb-2">
                Pegá el snippet antes del cierre <code className="bg-slate-100 px-1 rounded">&lt;/head&gt;</code> en el HTML de todas tus páginas.
              </p>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs font-mono">{`<head>
  ...
  <!-- DIANA Tracking -->
  <script src="..." async></script>
</head>`}</pre>
            </div>
          </details>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PASO 2 — Dominio first-party (CNAME)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="mb-6">
        <div className="flex items-start gap-3 mb-4 px-1">
          <div
            className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: domainActive ? '#22c55e' : '#E53535' }}
          >
            {domainActive ? <CheckCircle2 className="w-4 h-4" /> : '2'}
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-500" />
              Activá el tracking desde tu dominio
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>Muy recomendado</strong> · Sin esto el script viene de un dominio ajeno y puede ser bloqueado por Brave, Firefox o Safari.
            </p>
          </div>
        </div>

        <CustomDomainSetup
          initialDomain={workspace.custom_domain ?? null}
          initialVerified={workspace.custom_domain_verified ?? false}
          trackingId={workspace.tracking_id}
          appUrl={appUrl}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PASO 3 — Conectar integraciones
      ══════════════════════════════════════════════════════════════════ */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-7 h-7 rounded-full text-white text-sm flex items-center justify-center font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: hasIntegration ? '#22c55e' : '#E53535' }}
          >
            {hasIntegration ? <CheckCircle2 className="w-4 h-4" /> : '3'}
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Plug className="w-4 h-4 text-slate-500" />
              Conectá tus plataformas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>Obligatorio para conversiones</strong> · Sin esto el tracking funciona, pero los datos no llegan a Meta, Google Ads ni tu CRM.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 mb-4 text-sm text-slate-600">
          <p>
            Cuando alguien visita tu sitio, llena un formulario o compra, DIANA registra ese evento.
            Al conectar tus plataformas, ese dato se envía automáticamente como conversión verificada —
            así tus campañas de Meta o Google Ads aprenden de datos reales.
          </p>
        </div>

        {hasIntegration ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 mb-4">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Tenés al menos una integración activa.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4">
            <span className="text-amber-500 font-bold">!</span>
            <span>No conectaste ninguna plataforma todavía.</span>
          </div>
        )}

        <a
          href="/integrations"
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg text-white transition-colors"
          style={{ backgroundColor: '#E53535' }}
        >
          <Plug className="w-4 h-4" />
          {hasIntegration ? 'Ver mis integraciones' : 'Conectar plataformas'}
        </a>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PASO 4 — Verificar
      ══════════════════════════════════════════════════════════════════ */}
      <div className="card p-6 mb-10">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 text-sm flex items-center justify-center font-bold shrink-0 mt-0.5"
          >4</div>
          <div>
            <h2 className="font-semibold text-slate-900">Verificá que funciona</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>Recomendado</strong> · Hacelo después de instalar el snippet para confirmar que recibís datos.
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          El <strong>Simulador</strong> genera una visita de prueba desde tu sitio.
          En segundos vas a ver el evento aparecer en el panel — así confirmás que la instalación está bien.
        </p>

        <a
          href="/test"
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          Ir al Simulador
        </a>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          AVANZADO — colapsado por default
      ══════════════════════════════════════════════════════════════════ */}
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer select-none list-none text-sm text-slate-400 hover:text-slate-600 transition-colors mb-5">
          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
          Tracking avanzado — compras y leads manuales
        </summary>

        <div className="space-y-4 mt-2">
          <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">
            El snippet detecta automáticamente los formularios con email y los page views.
            Solo necesitás el código de abajo si tu checkout o formulario tiene una lógica especial que DIANA no detecta sola.
          </p>

          {/* Purchase */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Registrar una compra manualmente</h3>
                <p className="text-xs text-slate-500 mt-0.5">Pegalo en tu página de confirmación de compra.</p>
              </div>
              <CopySnippetButton text={purchaseSnippet} label="Copiar" />
            </div>
            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
              {purchaseSnippet}
            </pre>
          </div>

          {/* Lead */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Registrar un lead manualmente</h3>
                <p className="text-xs text-slate-500 mt-0.5">Para formularios donde DIANA no detecta el email automáticamente.</p>
              </div>
              <CopySnippetButton text={leadSnippet} label="Copiar" />
            </div>
            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
              {leadSnippet}
            </pre>
          </div>

        </div>
      </details>

    </div>
  );
}
