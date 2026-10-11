import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Map, Users, ClipboardCheck, LayoutTemplate, Send, Inbox, Tags, Scale, Activity, Bell, LogOut, Menu } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { auth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { KillSwitchControl } from './KillSwitch';

export const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns', icon: Map },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/review', label: 'Review queue', icon: ClipboardCheck },
  { to: '/generator', label: 'Generator', icon: LayoutTemplate },
  { to: '/outreach', label: 'Outreach', icon: Send },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/pricing', label: 'Pricing', icon: Tags },
  { to: '/compliance', label: 'Compliance', icon: Scale },
  { to: '/ops', label: 'Ops', icon: Activity },
];

function HealthDot() {
  const q = useQuery({ queryKey: keys.health, queryFn: api.health.get, refetchInterval: 30_000, staleTime: 25_000, retry: false, meta: { silent: true } });
  const status = q.isError ? 'down' : q.data?.status ?? 'unknown';
  const label = status === 'ok' ? 'API healthy' : status === 'degraded' ? 'API degraded' : status === 'down' ? 'API unreachable' : 'Checking API…';
  const detail = q.data ? `DB ${String((q.data.db as { ok?: boolean })?.ok ?? q.data.db)}, Redis ${String((q.data.redis as { ok?: boolean })?.ok ?? q.data.redis)}, ${q.data.external?.filter((e) => !e.reachable).length ?? 0} external host(s) unreachable` : undefined;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-fg" title={detail} aria-live="polite">
      <span className={cn('inline-block size-2.5 rounded-full', status === 'ok' && 'bg-success', status === 'degraded' && 'bg-warning', status === 'down' && 'bg-critical', status === 'unknown' && 'bg-muted-fg')} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function AppShell() {
  const location = useLocation();
  const [navOpen, setNavOpen] = React.useState(false);
  const health = useQuery({ queryKey: keys.health, queryFn: api.health.get, refetchInterval: 30_000, staleTime: 25_000, retry: false, meta: { silent: true } });
  const alerts = useQuery({ queryKey: [...keys.alerts, 'open'], queryFn: () => api.ops.alerts(false), refetchInterval: 60_000, staleTime: 50_000, meta: { silent: true } });
  const unacked = alerts.data?.filter((a) => !a.acknowledgedAt).length ?? 0;
  const killEngaged = health.data?.killSwitch ?? false;
  React.useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className="flex h-full min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded focus:bg-card focus:p-2">
        Skip to content
      </a>
      <aside className={cn('fixed inset-y-0 left-0 z-40 w-56 shrink-0 border-r bg-card transition-transform md:static md:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')} aria-label="Primary">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="inline-block size-3 rounded-sm bg-primary" aria-hidden />
          <span className="font-semibold">Sitewright</span>
          <span className="text-xs text-muted-fg">console</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted', isActive && 'bg-accent font-medium text-primary')}
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
              {n.to === '/ops' && unacked > 0 && <span className="ml-auto rounded-full bg-critical-bg px-1.5 text-xs text-critical tabular-nums">{unacked}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-fg" onClick={() => auth.setToken(null)}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </Button>
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn('sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-bg/95 px-4 backdrop-blur', killEngaged && 'border-b-critical')}>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Toggle navigation" onClick={() => setNavOpen((o) => !o)}>
            <Menu className="size-5" />
          </Button>
          <KillSwitchControl engaged={killEngaged} unknown={!health.data} compact />
          <div className="ml-auto flex items-center gap-4">
            <NavLink to="/ops#alerts" className="relative flex items-center gap-1.5 text-xs text-muted-fg hover:text-fg" aria-label={`${unacked} unacknowledged alerts`}>
              <Bell className="size-4" aria-hidden />
              <span className={cn('tabular-nums', unacked > 0 && 'font-semibold text-critical')}>{unacked}</span>
              <span className="hidden sm:inline">unacked</span>
            </NavLink>
            <HealthDot />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
