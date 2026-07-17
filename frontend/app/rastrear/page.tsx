import TrackingCodeField from './TrackingCodeField';

/**
 * Página de rastreio — Server Component (busca no backend acontece no
 * servidor Next, antes de renderizar; sem loading state porque não
 * existe estado nenhum pra carregar do lado do cliente).
 *
 * Diferente do resto do site: chama o backend Express DIRETO (não
 * passa pelo proxy app/api/*), já que o motivo do proxy (client
 * component não pode expor a URL real do backend) não se aplica aqui.
 */

// Prioridade: BACKEND_URL (server-only, ideal, quando existir) →
// NEXT_PUBLIC_API_URL (já configurada em produção — como esta página é
// Server Component e nunca roda no browser, ler uma var NEXT_PUBLIC_
// aqui não expõe nada a mais do que já está exposto pro resto do site)
// → localhost (dev local). Evita depender de criar BACKEND_URL no
// dashboard da Vercel pra já funcionar em produção.
const API_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const WHATSAPP_URL = 'https://wa.me/5553984750216';

interface TrackingData {
  id: string;
  status: string;
  tracking_code: string | null;
  carrier: string | null;
  shipped_at: string | null;
  carrier_url: string | null;
}

async function fetchTracking(orderId: string): Promise<TrackingData | null> {
  try {
    const response = await fetch(`${API_URL}/api/orders/tracking/${encodeURIComponent(orderId)}`, {
      cache: 'no-store',
    });

    // 400 (formato inválido) e 404 (não existe) viram a mesma tela pro
    // cliente — "não encontramos esse pedido". A distinção entre os
    // dois só importa pra quem chama a API, não pra experiência dele.
    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

function formatDatePtBR(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default async function RastrearPage({
  searchParams,
}: {
  searchParams: { pedido?: string };
}) {
  const orderId = searchParams.pedido?.trim();

  if (!orderId) {
    return (
      <main className="page">
        <div className="card" style={{ cursor: 'default' }}>
          <h1>Rastrear pedido</h1>
          <form action="/rastrear" method="GET" className="form">
            <label>
              Cole o código do seu pedido
              <input type="text" name="pedido" required placeholder="Ex: 7b3a1276-6f70-416c-8e98-d9cdbe0fec89" />
            </label>
            <button type="submit">Rastrear</button>
          </form>
        </div>
      </main>
    );
  }

  const data = await fetchTracking(orderId);

  if (!data) {
    return (
      <main className="page">
        <div className="card" style={{ cursor: 'default' }}>
          <h1>Não encontramos esse pedido 🔍</h1>
          <p>Confere se o link está certo, ou fala com a gente pelo WhatsApp que a gente resolve.</p>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn btn--whatsapp">
            Falar no WhatsApp
          </a>
        </div>
      </main>
    );
  }

  // Ordem de prioridade combinada: refunded > tem tracking_code > paid
  // > pending/overdue. tracking_code na frente de "paid" é proposital
  // — cobre o caso (raro, mas possível dado como os campos são
  // preenchidos à mão) de já ter código antes do status virar "paid".
  if (data.status === 'refunded') {
    return (
      <main className="page">
        <div className="card" style={{ cursor: 'default' }}>
          <h1>Este pedido foi reembolsado</h1>
          <p>Fala com a gente pelo WhatsApp se precisar de mais alguma coisa.</p>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn btn--whatsapp">
            Falar no WhatsApp
          </a>
        </div>
      </main>
    );
  }

  if (data.tracking_code) {
    return (
      <main className="page">
        <div className="card qr-code-box" style={{ cursor: 'default' }}>
          <h1>Seu pedido está a caminho! 🚚</h1>
          <p className="form-hint">Código de rastreio:</p>
          <TrackingCodeField trackingCode={data.tracking_code} />
          {data.carrier_url ? (
            <a href={data.carrier_url} target="_blank" rel="noopener noreferrer" className="btn">
              Rastrear na transportadora →
            </a>
          ) : (
            <p className="form-hint">Copie o código e cole no site da transportadora.</p>
          )}
          {data.shipped_at && <p className="form-hint">Enviado em {formatDatePtBR(data.shipped_at)}</p>}
        </div>
      </main>
    );
  }

  if (data.status === 'paid') {
    return (
      <main className="page">
        <div className="card" style={{ cursor: 'default' }}>
          <h1>Seu pedido está sendo preparado 📦</h1>
          <p>
            Recebemos seu pedido! Vamos preparar e despachar em até 3 dias úteis. Assim que sair pra
            entrega, você recebe o código de rastreio no seu e-mail.
          </p>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="form-hint">
            Alguma dúvida? Fala com a gente no WhatsApp: (53) 98475-0216
          </a>
        </div>
      </main>
    );
  }

  // status pending/overdue — e fallback de segurança pra qualquer
  // valor de status que não caiu em nenhum caso acima.
  return (
    <main className="page">
      <div className="card" style={{ cursor: 'default' }}>
        <h1>Estamos aguardando a confirmação do seu pagamento</h1>
        <p>Assim que cair, começamos a preparar seu pedido.</p>
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="form-hint">
          Alguma dúvida? Fala com a gente no WhatsApp: (53) 98475-0216
        </a>
      </div>
    </main>
  );
}
