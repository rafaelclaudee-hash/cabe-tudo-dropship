'use client';

import { useEffect } from 'react';
import { captureUtmFromCurrentUrl } from '@/lib/utm';

/**
 * Sem UI — só captura os UTMs da URL (se houver) pro cookie de
 * atribuição na primeira visita. Montado uma vez no layout raiz pra
 * rodar em toda página do site.
 */
export default function UtmCapture() {
  useEffect(() => {
    captureUtmFromCurrentUrl();
  }, []);

  return null;
}
