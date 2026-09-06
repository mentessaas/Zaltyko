"use client";

import Script from "next/script";
import { useEffect } from "react";

import { trackPageView } from "@/lib/analytics";
import { isGoogleAdsEnabled } from "@/lib/google-ads";

/**
 * Google Ads conversion tracking via gtag.js.
 *
 * Solo se monta si `NEXT_PUBLIC_GOOGLE_ADS_ID` está definida. En desarrollo
 * sin clave configurada, el componente no emite nada y el bundle no incluye
 * el script (ahorra peso y ruido en dev).
 *
 * Conversiones específicas (`signup_completed`, `subscription_activated`, etc.)
 * se disparan desde el código de negocio vía `trackGoogleAdsConversion()`
 * importado de `@/lib/google-ads`.
 *
 * `subscription_activated` server-side se conecta con Google Ads por
 * importación offline de conversiones (NO requiere este componente).
 */

export { trackGoogleAdsConversion, isGoogleAdsEnabled } from "@/lib/google-ads";

export function GoogleAdsTracking() {
  useEffect(() => {
    if (!isGoogleAdsEnabled()) return;
    // page_view se emite manualmente para mantener consistencia con el resto
    // del tracking SPA (PostHog + Vercel Analytics). gtag ya recibe
    // page_view automático al cargar, pero el segundo page_view (en SPA)
    // hay que empujarlo nosotros.
    trackPageView(window.location.pathname);
  }, []);

  if (!isGoogleAdsEnabled()) return null;

  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${adsId}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${adsId}');
        `}
      </Script>
    </>
  );
}
