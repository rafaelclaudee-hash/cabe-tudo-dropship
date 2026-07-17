/**
 * Captura e leitura de UTMs (atribuição de campanha) via cookie.
 * ------------------------------------------------------------------
 * Cookie em vez de localStorage: precisa ser possível ler no backend
 * futuramente (SSR/API calls) — localStorage só existe no navegador.
 *
 * Primeira atribuição: se já existe um cookie salvo, uma nova visita
 * (com ou sem UTMs na URL) NUNCA sobrescreve — a origem que trouxe o
 * cliente da primeira vez é a que fica valendo.
 */

export interface UtmData {
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_term?: string;
  src?: string;
  sck?: string;
}

const UTM_COOKIE_NAME = 'ct_utm';
const UTM_COOKIE_MAX_AGE_DAYS = 30;
const UTM_PARAM_KEYS: (keyof UtmData)[] = [
  'utm_source',
  'utm_campaign',
  'utm_medium',
  'utm_content',
  'utm_term',
  'src',
  'sck',
];

export function readUtmCookie(): UtmData | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${UTM_COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function writeUtmCookie(data: UtmData) {
  const expires = new Date(Date.now() + UTM_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${UTM_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}; expires=${expires}; path=/; samesite=lax`;
}

/**
 * Lê os parâmetros de UTM da URL atual e salva em cookie — só grava se
 * ainda não existir cookie (primeira atribuição) e só se pelo menos um
 * parâmetro estiver de fato presente na URL (visita sem nenhum UTM não
 * cria cookie vazio, deixando espaço pra uma visita futura COM UTM ser
 * a primeira atribuição real).
 */
export function captureUtmFromCurrentUrl() {
  if (typeof window === 'undefined') return;
  if (readUtmCookie()) return;

  const params = new URLSearchParams(window.location.search);
  const data: UtmData = {};
  let hasAny = false;

  for (const key of UTM_PARAM_KEYS) {
    const value = params.get(key);
    if (value) {
      data[key] = value;
      hasAny = true;
    }
  }

  if (hasAny) {
    writeUtmCookie(data);
  }
}
