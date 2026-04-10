'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

function DianaLogo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="9" fill="#0D1B2A" />
      <path d="M7 5h11c9.389 0 15 5.611 15 15s-5.611 15-15 15H7V5z" fill="white" />
      <path d="M13 11h5c5.523 0 9 3.477 9 9s-3.477 9-9 9h-5V11z" fill="#0D1B2A" />
      <circle cx="22" cy="20" r="5.5" fill="#E53535" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <DianaLogo size={44} />
          <div className="leading-none">
            <span className="text-2xl font-extrabold text-slate-900 tracking-wide block">DIANA</span>
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#E53535' }}>Tracking</span>
          </div>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Iniciar sesion</h1>
          <p className="text-slate-500 text-sm mb-6">Ingresa a tu cuenta para continuar.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
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
              <label className="label" htmlFor="password">Contrasena</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            No tienes cuenta?{' '}
            <Link href="/register" className="text-brand-600 hover:underline font-medium">
              Registrate gratis
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
