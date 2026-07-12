/**
 * API checkout — NÃO mexer ainda. Fase 2 do plano (integração com Asaas).
 * Por enquanto, mantém o mock.
 */
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.customerEmail || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'customerEmail e items são obrigatórios' }, { status: 400 });
  }

  // TODO: Integrar com Asaas para pagamento real
  return NextResponse.json({ ok: true, orderId: 'mock-123', totalCents: 0 });
}
