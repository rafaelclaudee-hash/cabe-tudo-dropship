import Image from 'next/image';
import Link from 'next/link';

export interface PromoBannerProps {
  imagem: string;
  selo?: string;
  titulo: string;
  precoDe?: string;
  precoPor: string;
  sufixoPreco?: string;
  textoBotao: string;
  link: string;
}

/**
 * Banner promocional compacto — reutilizável pra destacar qualquer
 * produto/oferta no topo da home (ou em outra página, se precisar).
 * Todos os dados vêm de props; nenhum produto fixo aqui dentro.
 */
export default function PromoBanner({
  imagem,
  selo,
  titulo,
  precoDe,
  precoPor,
  sufixoPreco,
  textoBotao,
  link,
}: PromoBannerProps) {
  return (
    <div className="promo-banner">
      <Link href={link} className="promo-banner__media" aria-label={titulo}>
        {selo && <span className="promo-banner__selo">{selo}</span>}
        <Image
          src={imagem}
          alt={titulo}
          fill
          sizes="(max-width: 700px) 100vw, 140px"
          className="promo-banner__image"
        />
      </Link>

      <div className="promo-banner__content">
        <h2 className="promo-banner__titulo">{titulo}</h2>
        <div className="promo-banner__precos">
          {precoDe && <span className="promo-banner__preco-de">{precoDe}</span>}
          <span className="promo-banner__preco-por">
            {precoPor}
            {sufixoPreco && <small> {sufixoPreco}</small>}
          </span>
        </div>
      </div>

      <Link href={link} className="btn promo-banner__btn">
        {textoBotao}
      </Link>
    </div>
  );
}
