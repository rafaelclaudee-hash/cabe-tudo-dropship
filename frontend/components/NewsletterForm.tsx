'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { subscribeNewsletter } from '@/lib/api';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [aceite, setAceite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await subscribeNewsletter({ email, aceite_lgpd: aceite, origem: 'rodape' });
      setSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao inscrever.');
    } finally {
      setSubmitting(false);
    }
  }

  if (subscribed) {
    return <p className="newsletter-form__success">Inscrito! Você vai receber nossas novidades por e-mail.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="newsletter-form">
      <div className="copy-field">
        <input
          type="email"
          placeholder="Seu melhor e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Inscrevendo...' : 'Inscrever'}
        </button>
      </div>

      <label className="form-checkbox">
        <input
          type="checkbox"
          checked={aceite}
          onChange={(e) => setAceite(e.target.checked)}
          required
          disabled={submitting}
        />
        <span>
          Aceito receber novidades por e-mail e concordo com a{' '}
          <Link href="/politica-de-privacidade">Política de Privacidade</Link>
        </span>
      </label>

      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
