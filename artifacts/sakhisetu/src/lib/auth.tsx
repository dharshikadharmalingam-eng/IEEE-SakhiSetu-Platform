import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCurrentUserQueryKey, useGetCurrentUser, useLogout } from '@workspace/api-client-react';
import type { CurrentUser } from '@workspace/api-client-react';
import { Redirect, useLocation } from 'wouter';
import { LoadingState } from '@/lib/ui';

type Role = CurrentUser['role'];
type AuthState = { user: CurrentUser | null; isLoading: boolean; signIn: (user: CurrentUser) => void; signOut: () => Promise<void> };
const Ctx = createContext<AuthState | null>(null);

export const homeFor = (role: Role) => (role === 'employer' ? '/employer/dashboard' : role === 'admin' ? '/admin/dashboard' : '/dashboard');

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false, staleTime: 60_000 } });
  const logout = useLogout();
  const user = data ?? null;
  const value: AuthState = {
    user, isLoading,
    // Clear every cached query on sign-in/out so one person's data is never shown to the next.
    signIn: (u) => { qc.clear(); qc.setQueryData(getGetCurrentUserQueryKey(), u); },
    signOut: async () => { try { await logout.mutateAsync(); } finally { qc.clear(); qc.setQueryData(getGetCurrentUserQueryKey(), null); } },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** Route guard: sends anonymous visitors to sign-in, and other roles to their own home. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location]);
  if (isLoading) return <div className="p-8"><LoadingState label="Checking your session" /></div>;
  if (!user) return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  if (!roles.includes(user.role)) return <Redirect to={homeFor(user.role)} />;
  return <>{children}</>;
}
