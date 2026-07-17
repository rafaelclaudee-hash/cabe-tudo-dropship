'use client';

import { useState } from 'react';

/**
 * Único pedaço interativo da página /rastrear (o resto é Server
 * Component) — precisa de client JS pra usar navigator.clipboard e
 * pra selecionar o texto todo no foco (mesmo padrão do campo de
 * copiar o payload Pix no checkout).
 */
export default function TrackingCodeField({ trackingCode }: { trackingCode: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="copy-field">
      <input
        type="text"
        readOnly
        value={trackingCode}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" onClick={handleCopy}>
        {copied ? 'Copiado!' : 'Copiar código'}
      </button>
    </div>
  );
}
