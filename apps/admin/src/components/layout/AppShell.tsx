import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Map, Users, ClipboardCheck, LayoutTemplate, Send, Inbox, CalendarCheck, CalendarClock, Tags, Scale, Activity, Bell, LogOut, Menu } from 'lucide-react';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { auth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { KillSwitchControl } from './KillSwitch';

export const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Pipeline' },
  { to: '/campaigns', label: 'Campaigns', icon: Map, group: 'Pipeline' },
  { to: '/leads', label: 'Leads', icon: Users, group: 'Pipeline' },
  { to: '/review', label: 'Review queue', icon: ClipboardCheck, group: 'Pipeline' },
  { to: '/generator', label: 'Generator', icon: LayoutTemplate, group: 'Pipeline' },
  { to: '/outreach', label: 'Outreach', icon: Send, group: 'Outreach' },
  { to: '/inbox', label: 'Inbox', icon: Inbox, group: 'Outreach' },
  { to: '/meetings', label: 'Meetings', icon: CalendarCheck, group: 'Outreach' },
  { to: '/pricing', label: 'Pricing', icon: Tags, group: 'Settings' },
  { to: '/scheduling', label: 'Scheduling', icon: CalendarClock, group: 'Settings' },
  { to: '/compliance', label: 'Compliance', icon: Scale, group: 'Settings' },
  { to: '/ops', label: 'Ops', icon: Activity, group: 'Settings' },
] as const;

const GROUPS = ['Pipeline', 'Outreach', 'Settings'] as const;

function HealthDot() {
  const q = useQuery({ queryKey: keys.health, queryFn: api.health.get, refetchInterval: 30_000, staleTime: 25_000, retry: false, meta: { silent: true } });
  const status = q.isError ? 'down' : q.data?.status ?? 'unknown';
  const label = status === 'ok' ? 'API healthy' : status === 'degraded' ? 'API degraded' : status === 'down' ? 'API unreachable' : 'Checking API…';
  const detail = q.data ? `DB ${String((q.data.db as { ok?: boolean })?.ok ?? q.data.db)}, Redis ${String((q.data.redis as { ok?: boolean })?.ok ?? q.data.redis)}, ${q.data.external?.filter((e) => !e.reachable).length ?? 0} external host(s) unreachable` : undefined;
  return (
    <span className="flex items-center gap-2 text-sm text-muted-fg" title={detail} aria-live="polite">
      <span className={cn('inline-block size-2 rounded-full', status === 'ok' && 'bg-good-dot', status === 'degraded' && 'bg-warn-dot', status === 'down' && 'bg-bad-dot', status === 'unknown' && 'bg-neutral-dot')} aria-hidden />
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
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col border-r bg-card transition-transform md:static md:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')} aria-label="Primary">
        <div className="flex h-14 items-center gap-2.5 px-5">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-fg" aria-hidden>
            S
          </span>
          <span className="text-sm font-semibold">Sitewright</span>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 pb-4">
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="t-label mb-1 px-3">{g}</div>
              <div className="flex flex-col gap-0.5">
                {NAV.filter((n) => n.group === g).map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className={({ isActive }) => cn('flex h-9 items-center gap-3 rounded-md px-3 text-base text-fg transition-colors hover:bg-muted', isActive && 'bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] font-medium text-primary hover:bg-[color-mix(in_oklab,var(--primary)_12%,transparent)]')}
                  >
                    <n.icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="truncate">{n.label}</span>
                    {n.to === '/ops' && unacked > 0 && <span className="ml-auto rounded-full bg-bad-bg px-1.5 text-xs font-medium text-bad-fg tabular-nums">{unacked}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <Button variant="ghost" className="w-full justify-start px-3 text-muted-fg" onClick={() => auth.setToken(null)}>
            <LogOut className="size-5" strokeWidth={1.75} aria-hidden /> Sign out
          </Button>
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn('sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-bg/80 px-4 backdrop-blur-xl backdrop-saturate-150 md:px-8', killEngaged && 'border-b-bad-dot')}>
          <Button variant="ghost" size="iconSm" className="md:hidden" aria-label="Toggle navigation" onClick={() => setNavOpen((o) => !o)}>
            <Menu className="size-5" />
          </Button>
          <KillSwitchControl engaged={killEngaged} unknown={!health.data} compact />
          <div className="ml-auto flex items-center gap-5">
            <NavLink to="/ops#alerts" className="flex items-center gap-2 text-sm text-muted-fg hover:text-fg" aria-label={`${unacked} unacknowledged alerts`}>
              <Bell className="size-4" aria-hidden />
              <span className={cn('tabular-nums', unacked > 0 && 'font-medium text-fg')}>{unacked}</span>
              <span className="hidden sm:inline">unacknowledged</span>
            </NavLink>
            <HealthDot />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
