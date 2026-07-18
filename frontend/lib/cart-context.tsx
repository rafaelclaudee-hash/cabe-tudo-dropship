'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface CartLineItem {
  slug: string;
  quantity: number;
}

interface CartContextValue {
  items: CartLineItem[];
  totalItemCount: number;
  addItem: (slug: string, quantity?: number) => void;
  removeItem: (slug: string) => void;
  updateQuantity: (slug: string, quantity: number) => void;
  clearCart: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'cabetudo_cart';

/**
 * Estado do carrinho (Fase 1, sem login ainda — quando existir conta,
 * isso passa a sincronizar com o banco; por ora só localStorage).
 * Monta uma vez no layout raiz pra header (badge) e páginas de produto
 * (adicionar) compartilharem o mesmo estado via useCart().
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hidrata do localStorage só depois do primeiro render — localStorage
  // não existe durante SSR, e ler direto no useState causaria
  // divergência entre o HTML do servidor e o do cliente.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch (err) {
      console.error(err);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // evita sobrescrever o localStorage com [] antes de hidratar
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error(err);
    }
  }, [items, hydrated]);

  const addItem = useCallback((slug: string, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((item) => item.slug === slug);
      if (existing) {
        return current.map((item) => (item.slug === slug ? { ...item, quantity: item.quantity + quantity } : item));
      }
      return [...current, { slug, quantity }];
    });
  }, []);

  const removeItem = useCallback((slug: string) => {
    setItems((current) => current.filter((item) => item.slug !== slug));
  }, []);

  const updateQuantity = useCallback((slug: string, quantity: number) => {
    setItems((current) => {
      if (quantity <= 0) return current.filter((item) => item.slug !== slug);
      return current.map((item) => (item.slug === slug ? { ...item, quantity } : item));
    });
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const value = useMemo(
    () => ({ items, totalItemCount, addItem, removeItem, updateQuantity, clearCart, isOpen, openCart, closeCart }),
    [items, totalItemCount, addItem, removeItem, updateQuantity, clearCart, isOpen, openCart, closeCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa ser usado dentro de <CartProvider>');
  return ctx;
}
