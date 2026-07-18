'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCurrentCustomer, logoutCustomer, type CustomerAccount } from '@/lib/api';

interface AuthContextValue {
  customer: CustomerAccount | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Estado da conta logada, montado uma vez no layout raiz — o header
 * (link "Minha conta"/nome) e a página /conta compartilham o mesmo
 * estado via useAuth(). `loading` fica true até a primeira checagem de
 * /api/auth/me terminar (evita mostrar "Entrar" por um instante mesmo
 * pra quem já está logado).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCurrentCustomer();
      setCustomer(data);
    } catch (err) {
      console.error(err);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await logoutCustomer();
    setCustomer(null);
  }, []);

  const value = useMemo(() => ({ customer, loading, refresh, logout }), [customer, loading, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>');
  return ctx;
}
