/**
 * API auth/logout — proxy para o backend real (POST /api/auth/logout).
 * Repassa o Cookie recebido (não é estritamente necessário pro backend
 * limpar a sessão, mas mantém o padrão) e o Set-Cookie de limpeza de
 * volta pro navegador.
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: Request) {
  try {
    const response = await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: request.headers.get('cookie') || '' },
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
