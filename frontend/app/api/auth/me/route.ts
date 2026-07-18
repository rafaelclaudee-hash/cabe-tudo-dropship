/**
 * API auth/me — proxy para o backend real (GET /api/auth/me).
 * Repassa o Cookie recebido do navegador pro backend, pra ele conseguir
 * validar a sessão (o backend não recebe cookie nenhum sem isso).
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function GET(request: Request) {
  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { cookie: request.headers.get('cookie') || '' },
      cache: 'no-store',
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Backend indisponível' }, { status: 503 });
  }
}
