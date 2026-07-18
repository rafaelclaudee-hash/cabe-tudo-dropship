'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

/**
 * Link "Minha conta" no header — mesma classe/estilo dos outros links
 * de .site-header__nav (nenhum CSS novo precisa). Mostra "Entrar"
 * enquanto não logado (ou ainda checando a sessão) e o primeiro nome
 * do cliente quando logado.
 */
export default function AccountLink() {
  const { customer, loading } = useAuth();

  if (!loading && customer) {
    return <Link href="/conta">{customer.name.split(' ')[0]}</Link>;
  }

  return <Link href="/conta/entrar">Entrar</Link>;
}
