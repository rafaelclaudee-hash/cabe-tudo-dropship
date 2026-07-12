/**
 * API orders — proxy para o backend real.
 * O backend está em http://localhost:3000 em dev.
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/api/orders?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Backend indisponível' }, { status: 503 });
  }
}
