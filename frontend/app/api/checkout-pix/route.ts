/**
 * API checkout-pix — proxy para o backend real (POST /checkout).
 * O backend está em http://localhost:3000 em dev.
 *
 * Diferente de /api/checkout (mock antigo, não mexer): este proxy chama
 * o fluxo Pix de verdade — cria pedido + cobrança no Asaas e devolve o
 * QR code.
 */
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch(`${API_URL}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Backend indisponível' }, { status: 503 });
  }
}
