/**
 * API health — proxy para o backend real.
 * O backend está em http://localhost:3000 em dev.
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function GET() {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Backend indisponível' }, { status: 503 });
  }
}
