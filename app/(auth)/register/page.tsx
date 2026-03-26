'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Activity } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [siteName, setSiteName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { site_name: siteName },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Update workspace name
    const { data: { user } } = await supabase.auth.getUser();
    if (user && siteName) {
      await supabase
        .from('workspaces')
        .update({ name: siteName })
        .eq('user_id', user.id);
    }

    // Wait a moment for the DB trigger to create the workspace, then update its name
    if (siteName) {
      await new Promise(r => setTimeout(r, 1500));
      const { data: { user: newUser } } = await supabase.auth.getUser();
      if (newUser) {
        await supabase
          .from('workspaces')
          .update({ name: siteName })
          .eq('user_id', newUser.id);
      }
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold mb-2">¡Revisa tu email!</h2>
          <p className="text-slate-500 text-sm">
            Te enviamos un enlace de confirmación a <strong>{email}</strong>.
            Haz clic en el enlace para activar tu cuenta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="p-2 bg-brand-500 rounded-xl">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900">TrackerSaaS</span>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Crear cuenta</h1>
          <p className="text-slate-500 text-sm mb-6">Empieza a trackear gratis, sin tarjeta.</p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="label">Nombre de tu sitio</label>
              <input
                type="text"
                required
                value={siteName}
                onChange={e => setSiteName(e.target.value)}
                className="input"
                placeholder="Mi tienda online"
              />
            </div>

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="tu@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-brand-600 hover:underline font-medium">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
