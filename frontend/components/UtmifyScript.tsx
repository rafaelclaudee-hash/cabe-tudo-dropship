'use client';

import Script from 'next/script';

export default function UtmifyScript() {
  return (
    <Script
      src="https://cdn.utmify.com.br/scripts/utms/latest.js"
      data-utmify-prevent-xcod-sck=""
      data-utmify-prevent-subids=""
      strategy="afterInteractive"
    />
  );
}
