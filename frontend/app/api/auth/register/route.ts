/**
 * API auth/register — proxy para o backend real (POST /api/auth/register).
 * Diferente dos outros proxies (só repassam JSON): aqui também repassa o
 * Set-Cookie da sessão (JWT httpOnly) que o backend devolve, pro navegador
 * guardar contra a origem do frontend.
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    const nextResponse = NextResponse.json(data, { status: response.status });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      nextResponse.headers.set('set-cookie', setCookie);
    }

    return nextResponse;
  } catch (error) {
    return NextResponse.json({ error: 'Backend indisponível' }, { status: 503 });
  }
}
