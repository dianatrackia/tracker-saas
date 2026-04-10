'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, Activity, Zap, Code2, TrendingUp, FlaskConical } from 'lucide-react';

const navItems = [
  { href: '/dashboard',     label: 'Resumen',          icon: BarChart2 },
  { href: '/campaigns',     label: 'Campanas',          icon: TrendingUp },
  { href: '/events',        label: 'Eventos',           icon: Activity },
  { href: '/integrations',  label: 'Integraciones',     icon: Zap },
  { href: '/snippet',       label: 'Instalar Snippet',  icon: Code2 },
  { href: '/test',          label: 'Simulador',         icon: FlaskConical },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 p-3 space-y-0.5">
      {navItems.map(item => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link key={item.href} href={item.href}
            className="flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150"
            style={isActive ? { backgroundColor: 'rgba(229,53,53,0.14)', color: '#FF7070', borderLeft: '3px solid #E53535', padding: '10px 12px 10px 9px' }
              : { color: 'rgba(255,255,255,0.55)', borderLeft: '3px solid transparent', padding: '10px 12px 10px 9px' }}>
            <item.icon className="w-4 h-4 shrink-0" style={{ color: isActive ? '#E53535' : 'rgba(255,255,255,0.38)' }} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
