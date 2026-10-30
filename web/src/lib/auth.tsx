import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import { closeSocket } from './socket';

interface User { id: string; email: string; name: string }
interface AuthCtx { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; register: (name: string, email: string, password: string) => Promise<void>; logout: () => void }
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const logout = useCallback(() => { tokenStore.clear(); closeSocket(); setUser(null); }, []);
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get<{ user: User }>('/auth/me').then((r) => setUser(r.user)).catch(() => logout()).finally(() => setLoading(false));
  }, [logout]);
  const value = useMemo<AuthCtx>(() => ({
    user, loading, logout,
    login: async (email, password) => { const r = await api.post<{ token: string; user: User }>('/auth/login', { email, password }); tokenStore.set(r.token); setUser(r.user); },
    register: async (name, email, password) => { const r = await api.post<{ token: string; user: User }>('/auth/register', { name, email, password }); tokenStore.set(r.token); setUser(r.user); },
  }), [user, loading, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error('AuthProvider missing'); return c; };
