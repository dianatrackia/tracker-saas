import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-slate-500 text-sm mt-1">Ajustes de tu cuenta y workspace.</p>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Tu workspace</h2>
        </div>

        <div>
          <p className="label">Email</p>
          <p className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            {user.email}
          </p>
        </div>

        <div>
          <p className="label">Nombre del sitio</p>
          <p className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            {workspace?.name}
          </p>
        </div>

        <div>
          <p className="label">Tracking ID</p>
          <code className="block text-xs font-mono bg-slate-900 text-green-400 px-3 py-2 rounded-lg">
            {workspace?.tracking_id}
          </code>
          <p className="text-xs text-slate-400 mt-1">Este es tu identificador único para el snippet.</p>
        </div>

        <div>
          <p className="label">Plan actual</p>
          <span className="inline-flex text-xs font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            {workspace?.plan === 'free' ? '✦ Gratuito' : workspace?.plan}
          </span>
        </div>
      </div>
    </div>
  );
}
