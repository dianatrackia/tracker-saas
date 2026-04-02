'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, Activity, Zap, Code2, TrendingUp } from 'lucide-react';

const navItems = [
  { href: '/dashboard',     label: 'Resumen',          icon: BarChart2 },
  { href: '/campaigns',     label: 'Campañas',          icon: TrendingUp },
  { href: '/events',        label: 'Eventos',           icon: Activity },
  { href: '/integrations',  label: 'Integraciones',     icon: Zap },
  { href: '/snippet',       label: 'Instalar Snippet',  icon: Code2 },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-4 space-y-1">
      {navItems.map(item => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
