import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidade — Cabe Tudo',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="page">
      <Link href="/" className="btn-back">← Voltar</Link>

      <h1>Política de Privacidade — Cabe Tudo</h1>
      <p className="form-hint">Última atualização: 18 de julho de 2026</p>

      <p>
        A Cabe Tudo (&quot;nós&quot;) respeita sua privacidade e se compromete a proteger
        os dados pessoais de quem visita e compra em lojacabetudo.com.br, em
        conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
      </p>

      <h2>1. Quem somos</h2>
      <p>
        A Cabe Tudo é uma loja online de produtos organizadores e utilidades para
        casa. Para dúvidas sobre esta política ou sobre seus dados, entre em
        contato pelo e-mail contato@lojacabetudo.com.br ou WhatsApp (53) 98475-0216.
      </p>

      <h2>2. Quais dados coletamos</h2>
      <ul>
        <li>
          <strong>Dados de cadastro:</strong> nome, e-mail e senha (criptografada), quando
          você cria uma conta.
        </li>
        <li>
          <strong>Dados de pedido:</strong> nome, e-mail, telefone e endereço de entrega,
          necessários para processar e entregar sua compra.
        </li>
        <li>
          <strong>Dados de pagamento:</strong> processados diretamente pela nossa
          processadora de pagamentos (Asaas). Não armazenamos número de cartão
          de crédito em nossos servidores.
        </li>
        <li>
          <strong>Dados de navegação:</strong> cookies e identificadores usados para
          funcionamento do carrinho de compras e, quando aplicável, para
          mensuração de anúncios (ex: Meta Pixel).
        </li>
        <li>
          <strong>Newsletter:</strong> se você optar por receber novidades, armazenamos seu
          e-mail e o consentimento dado.
        </li>
      </ul>

      <h2>3. Para que usamos seus dados</h2>
      <ul>
        <li>Processar e entregar seus pedidos</li>
        <li>Comunicar sobre o status da sua compra (confirmação, rastreio)</li>
        <li>Responder suas dúvidas e solicitações de atendimento</li>
        <li>Enviar novidades e promoções, somente se você optar por isso</li>
        <li>Melhorar a experiência de compra no site</li>
        <li>Cumprir obrigações legais e fiscais</li>
      </ul>

      <h2>4. Com quem compartilhamos seus dados</h2>
      <p>
        Compartilhamos dados pessoais apenas quando necessário para a operação
        da loja:
      </p>
      <ul>
        <li>
          <strong>Processadora de pagamento (Asaas):</strong> para processar pagamentos via
          Pix, cartão e boleto.
        </li>
        <li>
          <strong>Fornecedores/parceiros logísticos (ex: C7Drop) e transportadoras:</strong>{' '}
          para preparar e entregar seu pedido — recebem apenas nome, endereço e
          telefone, o mínimo necessário para a entrega.
        </li>
        <li>
          <strong>Ferramentas de e-mail (Zoho Mail):</strong> para envio de comunicações
          sobre seu pedido.
        </li>
        <li>
          <strong>Ferramentas de análise/publicidade (ex: Meta/Utmify), quando ativas:</strong>{' '}
          para mensurar desempenho de anúncios, de forma agregada.
        </li>
      </ul>
      <p>Não vendemos seus dados pessoais a terceiros.</p>

      <h2>5. Cookies</h2>
      <p>
        Usamos cookies essenciais para o funcionamento do carrinho de compras e
        da sua sessão de login. Você pode desativar cookies nas configurações do
        seu navegador, mas isso pode afetar o funcionamento do site.
      </p>

      <h2>6. Seus direitos (LGPD)</h2>
      <p>Você pode, a qualquer momento, solicitar:</p>
      <ul>
        <li>Confirmação de que tratamos seus dados</li>
        <li>Acesso aos dados que temos sobre você</li>
        <li>Correção de dados incompletos ou desatualizados</li>
        <li>
          Exclusão dos seus dados (respeitando obrigações legais de guarda de
          registros fiscais, quando aplicável)
        </li>
        <li>Revogação do consentimento (ex: sair da newsletter)</li>
        <li>Portabilidade dos seus dados</li>
      </ul>
      <p>
        Para exercer qualquer um desses direitos, entre em contato pelo e-mail
        contato@lojacabetudo.com.br.
      </p>

      <h2>7. Segurança</h2>
      <p>
        Adotamos medidas técnicas razoáveis para proteger seus dados, incluindo
        senhas criptografadas e conexão segura (HTTPS) em todo o site.
      </p>

      <h2>8. Alterações nesta política</h2>
      <p>
        Podemos atualizar esta política periodicamente. A data da última
        atualização estará sempre indicada no topo desta página.
      </p>

      <h2>9. Contato</h2>
      <p>
        Dúvidas sobre esta política ou sobre seus dados pessoais:{' '}
        contato@lojacabetudo.com.br
      </p>
    </main>
  );
}
