import Link from 'next/link';

export const metadata = {
  title: 'Política de Troca e Devolução — Cabe Tudo',
};

export default function ReturnPolicyPage() {
  return (
    <main className="page">
      <Link href="/" className="btn-back">← Voltar</Link>

      <h1>Política de Troca e Devolução — Cabe Tudo</h1>
      <p className="form-hint">Última atualização: 23 de julho de 2026</p>

      <p>
        Esta política explica como funcionam trocas, devoluções e cancelamentos
        na Cabe Tudo, em conformidade com o Código de Defesa do Consumidor
        (Lei nº 8.078/1990).
      </p>

      <h2>1. Direito de arrependimento (7 dias)</h2>
      <p>
        Como a compra é feita fora de um estabelecimento físico, você tem até{' '}
        <strong>7 (sete) dias corridos</strong>, a contar da data de recebimento
        do produto, para desistir da compra, sem precisar justificar o motivo,
        conforme o Art. 49 do Código de Defesa do Consumidor.
      </p>
      <p>
        Para exercer esse direito, entre em contato pelo e-mail
        contato@lojacabetudo.com.br ou WhatsApp (53) 98475-0216 informando o
        número do pedido. Sempre que possível, o produto deve ser devolvido na
        embalagem original, sem sinais de uso e com todos os acessórios.
      </p>

      <h2>2. Produto com defeito ou problema de qualidade</h2>
      <p>
        Se o produto apresentar defeito de fabricação ou não corresponder ao
        anunciado, você tem até <strong>90 (noventa) dias corridos</strong> a
        partir do recebimento para solicitar troca, reparo ou devolução do
        valor pago, conforme o Art. 26 do Código de Defesa do Consumidor
        (produtos duráveis). Entre em contato com fotos do produto e do
        problema relatado para agilizar a análise.
      </p>

      <h2>3. Como solicitar</h2>
      <p>Pra solicitar troca, devolução ou cancelamento:</p>
      <ul>
        <li>
          Entre em contato pelo WhatsApp (53) 98475-0216 ou e-mail
          contato@lojacabetudo.com.br, informando o número do pedido e o
          motivo.
        </li>
        <li>
          Nossa equipe vai confirmar os próximos passos e, quando necessário,
          enviar as instruções e o endereço para envio do produto de volta.
        </li>
        <li>Respondemos as solicitações em até 2 dias úteis.</li>
      </ul>

      <h2>4. Frete de devolução</h2>
      <p>
        Nos casos de arrependimento (item 1) ou defeito/problema de qualidade
        (item 2), o custo do frete de devolução é de responsabilidade da Cabe
        Tudo. Caso a devolução seja solicitada por outro motivo não previsto em
        lei, o custo do frete pode ser de responsabilidade do cliente,
        conforme acordado no atendimento.
      </p>

      <h2>5. Reembolso</h2>
      <p>
        Após recebermos e conferirmos o produto devolvido, o reembolso é
        processado no mesmo método de pagamento utilizado na compra (Pix,
        cartão ou boleto, via nossa processadora Asaas). O prazo para estorno
        pode variar conforme a instituição financeira, mas o processamento da
        nossa parte ocorre em até 7 dias úteis após a conferência do produto.
      </p>

      <h2>6. Prazos e o modelo de dropshipping</h2>
      <p>
        Como trabalhamos com fornecedores e parceiros logísticos (ex: C7Drop)
        para o envio dos produtos, o prazo para confirmação de devolução e
        reembolso pode levar um pouco mais de tempo do que em lojas com
        estoque próprio. Mantemos você informado sobre o andamento pelo
        e-mail ou WhatsApp cadastrado.
      </p>

      <h2>7. Contato</h2>
      <p>
        Dúvidas sobre trocas, devoluções ou cancelamentos: entre em contato
        pelo e-mail contato@lojacabetudo.com.br ou WhatsApp (53) 98475-0216.
      </p>
    </main>
  );
}
