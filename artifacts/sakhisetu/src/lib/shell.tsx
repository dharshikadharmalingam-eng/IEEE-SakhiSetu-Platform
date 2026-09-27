import { useState, type ReactNode } from 'react';
import {
  ArrowUpRight, BadgeCheck, BarChart3, Bell, BookOpen, BriefcaseBusiness, ChevronRight, ClipboardList, FileCheck2, Flag, GraduationCap, LogOut, Menu, MessageSquareHeart, Pencil,
  ShieldCheck, Sparkles, Target, UserRound, Users, Building2, X,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { getListNotificationsQueryKey, useListNotifications } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';
import { Logo, cx, initials } from '@/lib/ui';

type NavItem = { href: string; label: string; icon: typeof Target };

const WOMAN_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: BarChart3 },
  { href: '/profile', label: 'My readiness', icon: UserRound },
  { href: '/sakhi-score', label: 'Sakhi Score', icon: Target },
  { href: '/skills', label: 'Skills & proof', icon: BadgeCheck },
  { href: '/learning', label: 'Learning path', icon: BookOpen },
  { href: '/certificates', label: 'Certificates', icon: GraduationCap },
  { href: '/opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
  { href: '/applications', label: 'Applications', icon: FileCheck2 },
  { href: '/feedback', label: 'Feedback', icon: MessageSquareHeart },
  { href: '/reports', label: 'Reports', icon: Flag },
];
const EMPLOYER_NAV: NavItem[] = [
  { href: '/employer/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/employer/opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
  { href: '/employer/applications', label: 'Applications', icon: FileCheck2 },
  { href: '/employer/profile', label: 'Profile', icon: Building2 },
  { href: '/feedback', label: 'Feedback', icon: MessageSquareHeart },
  { href: '/reports', label: 'Reports', icon: Flag },
];
const ADMIN_NAV: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/employers', label: 'Employers', icon: ShieldCheck },
  { href: '/admin/opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
  { href: '/admin/courses', label: 'Courses', icon: BookOpen },
  { href: '/admin/reports', label: 'Reports', icon: ClipboardList },
];
const ROLE_LABEL = { woman: 'Woman · Sakhi', employer: 'Employer', admin: 'Administrator' } as const;

export function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { data: notes } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 60_000 } });
  const nav = user?.role === 'employer' ? EMPLOYER_NAV : user?.role === 'admin' ? ADMIN_NAV : WOMAN_NAV;
  const displayName = user?.name ?? '';
  const isActive = (href: string) => location === href || (href.length > 12 && location.startsWith(`${href}/`)) || (href === '/learning' && location.startsWith('/learning/')) || (href === '/opportunities' && location.startsWith('/opportunities/'));
  const unread = notes?.unreadCount ?? 0;
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to content</a>
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform duration-300 lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')} data-testid="sidebar">
        <div className="mb-8 flex items-center justify-between"><Logo light /><button type="button" className="rounded-full p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X size={18} /></button></div>
        <div className="mb-4 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-sidebar-foreground/45">{user?.role === 'woman' ? 'Your path' : user?.role === 'employer' ? 'Employer portal' : 'Administration'}</div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)} aria-current={isActive(href) ? 'page' : undefined}
              className={cx('group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive(href) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-foreground')}
              data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} /><span>{label}</span>{isActive(href) && <ChevronRight size={14} className="ml-auto" />}</Link>
          ))}
        </nav>
        {user?.role === 'woman' && (
          <div className="mt-4 hidden rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4 [@media(min-height:820px)]:block">
            <div className="mb-2 flex items-center gap-2 text-primary"><Sparkles size={16} /><span className="text-[11px] font-bold uppercase tracking-[.12em]">A small nudge</span></div>
            <p className="text-sm leading-5 text-sidebar-foreground/80">Add one more skill to make your next match clearer.</p>
            <Link href="/skills" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline" data-testid="link-sidebar-nudge">Add a skill <ArrowUpRight size={13} /></Link>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border pt-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-sm font-bold text-secondary">{initials(displayName)}</div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold" data-testid="text-user-name">{displayName}</p><p className="truncate text-xs text-sidebar-foreground/50" data-testid="text-user-role">{user ? ROLE_LABEL[user.role] : ''}</p></div>
          <button type="button" className="ml-auto rounded-full p-2 text-sidebar-foreground/60 hover:text-primary" aria-label="Sign out" onClick={async () => { await signOut(); setLocation('/login'); }} data-testid="button-signout"><LogOut size={16} /></button>
        </div>
      </aside>
      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-secondary/35 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay" data-testid="button-menu-overlay" />}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <button type="button" className="rounded-full p-2.5 text-muted-foreground hover:bg-muted lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu" data-testid="button-open-menu"><Menu size={20} /></button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-3))]" /> Your progress is saved as you go</div>
          <div className="ml-auto flex items-center gap-3">
            {user?.role === 'woman' && <Link href="/profile" className="hidden items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground sm:flex" data-testid="link-update-profile"><Pencil size={14} /> Update profile</Link>}
            <Link href="/notifications" className="relative rounded-full border border-border p-2.5 text-muted-foreground transition-colors hover:border-primary hover:text-foreground" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} data-testid="link-notifications"><Bell size={17} />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-secondary" data-testid="badge-unread">{unread > 9 ? '9+' : unread}</span>}</Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground" data-testid="avatar-current-user">{initials(displayName)}</div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
