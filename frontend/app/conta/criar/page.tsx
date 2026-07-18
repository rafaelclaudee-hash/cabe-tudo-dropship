'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registerCustomer } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function CreateAccountPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [aceitePrivacidade, setAceitePrivacidade] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await registerCustomer({ nome, email, senha, aceite_privacidade: aceitePrivacidade });
      await refresh();
      router.push('/conta');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>Criar conta</h1>

      <form onSubmit={handleSubmit} className="form">
        <label>
          Nome
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            minLength={6}
            disabled={submitting}
          />
        </label>
        <p className="form-hint">Mínimo de 6 caracteres.</p>

        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={aceitePrivacidade}
            onChange={(e) => setAceitePrivacidade(e.target.checked)}
            required
            disabled={submitting}
          />
          <span>
            Li e aceito a{' '}
            <Link href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer">
              Política de Privacidade
            </Link>
          </span>
        </label>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>

      <p className="form-hint">
        Já tem conta? <Link href="/conta/entrar">Entrar</Link>
      </p>
    </main>
  );
}
