import Link from 'next/link';

export const metadata = {
  title: 'Termos de Uso — Cabe Tudo',
};

export default function TermsOfUsePage() {
  return (
    <main className="page">
      <Link href="/" className="btn-back">← Voltar</Link>

      <h1>Termos de Uso — Cabe Tudo</h1>
      <p className="form-hint">Última atualização: 23 de julho de 2026</p>

      <p>
        Estes Termos de Uso regulam o acesso e uso do site lojacabetudo.com.br
        (&quot;Cabe Tudo&quot;, &quot;nós&quot;). Ao navegar ou realizar uma compra em nosso site,
        você concorda com as condições descritas abaixo.
      </p>

      <h2>1. Sobre a loja</h2>
      <p>
        A Cabe Tudo é uma loja online de produtos organizadores e utilidades
        para casa. Dúvidas, sugestões ou reclamações podem ser enviadas para
        contato@lojacabetudo.com.br ou pelo WhatsApp (53) 98475-0216.
      </p>

      <h2>2. Cadastro e conta</h2>
      <p>
        Para finalizar uma compra ou acompanhar pedidos, você pode criar uma
        conta com nome, e-mail e senha. Você é responsável por manter a
        confidencialidade da sua senha e por todas as atividades realizadas na
        sua conta. Avise-nos imediatamente em caso de uso não autorizado.
      </p>

      <h2>3. Produtos, preços e disponibilidade</h2>
      <p>
        Fazemos o possível para manter as informações de produtos, preços e
        disponibilidade atualizadas e corretas. Ainda assim, erros de descrição,
        preço ou estoque podem ocorrer; nesses casos, entraremos em contato
        antes de confirmar o pedido, e você poderá optar por cancelar sem
        qualquer custo.
      </p>
      <p>
        Os produtos vendidos pela Cabe Tudo são comercializados no modelo de
        dropshipping: o pedido é processado por nós, mas o envio pode ser feito
        diretamente por fornecedores/parceiros logísticos (ex: C7Drop). Por
        isso, os prazos de entrega podem ser mais longos do que em lojas com
        estoque próprio — o prazo estimado é sempre informado antes da
        finalização da compra.
      </p>

      <h2>4. Pagamento</h2>
      <p>
        Os pagamentos são processados por uma processadora de pagamentos
        parceira (Asaas), através de Pix, cartão de crédito ou boleto, conforme
        as opções disponíveis no checkout. A Cabe Tudo não armazena dados
        completos de cartão de crédito em seus próprios servidores.
      </p>

      <h2>5. Entrega</h2>
      <p>
        O prazo de entrega estimado é exibido no momento da compra e pode
        variar de acordo com o produto, a região de entrega e o fornecedor
        responsável pelo envio. Você pode acompanhar o status do seu pedido na
        página &quot;Rastrear pedido&quot; ou na sua conta, em &quot;Minha conta&quot;.
      </p>

      <h2>6. Trocas, devoluções e arrependimento</h2>
      <p>
        As condições de troca, devolução e direito de arrependimento estão
        descritas em detalhes na nossa{' '}
        <Link href="/politica-de-troca-devolucao">
          Política de Troca e Devolução
        </Link>
        , que faz parte integrante destes Termos de Uso.
      </p>

      <h2>7. Propriedade intelectual</h2>
      <p>
        O conteúdo do site (textos, imagens, logotipo e identidade visual da
        Cabe Tudo) é protegido por direitos autorais e não pode ser copiado,
        reproduzido ou utilizado comercialmente sem autorização prévia.
        Imagens de produtos podem pertencer a fornecedores e fabricantes e são
        usadas apenas para fins ilustrativos da venda.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        Envidamos esforços razoáveis para manter o site disponível e livre de
        erros, mas não garantimos operação ininterrupta ou isenta de falhas.
        Não nos responsabilizamos por atrasos ou problemas causados por
        terceiros (transportadoras, fornecedores, processadora de pagamento) ou
        por motivos de força maior.
      </p>

      <h2>9. Alterações destes termos</h2>
      <p>
        Podemos atualizar estes Termos de Uso periodicamente. A data da última
        atualização estará sempre indicada no topo desta página. O uso
        continuado do site após alterações representa concordância com os
        novos termos.
      </p>

      <h2>10. Lei aplicável</h2>
      <p>
        Estes Termos de Uso são regidos pelas leis brasileiras, em especial o
        Código de Defesa do Consumidor (Lei nº 8.078/1990) e a Lei Geral de
        Proteção de Dados (Lei nº 13.709/2018). Fica eleito o foro do
        domicílio do consumidor para dirimir eventuais controvérsias.
      </p>

      <h2>11. Contato</h2>
      <p>
        Dúvidas sobre estes Termos de Uso: contato@lojacabetudo.com.br ou
        WhatsApp (53) 98475-0216.
      </p>
    </main>
  );
}
