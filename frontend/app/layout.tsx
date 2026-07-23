import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Work_Sans } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import UtmCapture from '@/components/UtmCapture';
import CartIcon from '@/components/CartIcon';
import CartDrawer from '@/components/CartDrawer';
import AccountLink from '@/components/AccountLink';
import NewsletterForm from '@/components/NewsletterForm';
import MetaPixel from '@/components/MetaPixel';
import UtmifyScript from '@/components/UtmifyScript';
import { CartProvider } from '@/lib/cart-context';
import { AuthProvider } from '@/lib/auth-context';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-fraunces',
});

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-work-sans',
});

export const metadata: Metadata = {
  title: 'Cabe Tudo',
  description: 'Dropshipping de organização de cozinha'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${workSans.variable}`}>
      <body>
        <MetaPixel />
        <UtmifyScript />
        <AuthProvider>
        <CartProvider>
          <UtmCapture />
          <header className="site-header">
            <div className="site-header__inner">
              <Link href="/" className="site-header__brand" aria-label="Cabe Tudo - página inicial">
                <span className="site-header__logo-image">
                  <Image src="/logo.png" alt="Cabe Tudo" width={70} height={70} priority quality={90} />
                </span>
                <span className="site-header__logo">Cabe Tudo</span>
              </Link>
              <nav className="site-header__nav">
                <Link href="/">Início</Link>
                <AccountLink />
                <CartIcon />
              </nav>
            </div>
          </header>

          <CartDrawer />

          <div className="trust-bar">
            <div className="trust-bar__inner">
              <span>Frete grátis</span>
              <span>Pagamento seguro via Pix</span>
              <span>Entrega para todo o Brasil</span>
            </div>
          </div>

          {children}

          <footer className="site-footer">
            <div className="site-footer__newsletter">
              <div className="site-footer__newsletter-inner">
                <div className="site-footer__newsletter-copy">
                  <h4>Novidades por e-mail</h4>
                  <p className="site-footer__tagline">
                    Promoções e lançamentos, direto na sua caixa de entrada.
                  </p>
                </div>
                <NewsletterForm />
              </div>
            </div>

            <div className="site-footer__inner">
              <div>
                <div className="site-footer__brand">Cabe Tudo</div>
                <p className="site-footer__tagline">
                  Organização inteligente pra cada cantinho da sua casa.
                </p>
              </div>

              <div>
                <h4>Produtos</h4>
                <ul>
                  <li><Link href="/?categoria=cozinha">Cozinha</Link></li>
                  <li><Link href="/?categoria=banheiro">Banheiro</Link></li>
                  <li><Link href="/?categoria=organizacao">Organização</Link></li>
                </ul>
              </div>

              <div>
                <h4>Atendimento</h4>
                <ul>
                  <li><a href="https://wa.me/5553984750216">WhatsApp</a></li>
                  <li><a href="#">Perguntas frequentes</a></li>
                  <li><Link href="/rastrear">Rastrear pedido</Link></li>
                  <li><Link href="/politica-de-privacidade">Política de Privacidade</Link></li>
                  <li><Link href="/termos-de-uso">Termos de Uso</Link></li>
                  <li><Link href="/politica-de-troca-devolucao">Política de Troca e Devolução</Link></li>
                </ul>
              </div>

              <div>
                <h4>Pagamento</h4>
                <ul>
                  <li>Pix</li>
                  <li>Compra segura</li>
                </ul>
              </div>
            </div>

            <div className="site-footer__bottom">
              <div className="site-footer__bottom-inner">
                <span>© 2026 Cabe Tudo</span>
                <span>Cabe Tudo · Curitiba/PR</span>
              </div>
            </div>
          </footer>
        </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
