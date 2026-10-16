"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clearGrowthVisitorId } from "@/lib/growth/client";
import { UTM_STORAGE_KEY } from "@/lib/growth/utm";
import {
  COOKIE_CONSENT_OPEN_EVENT,
  saveCookieConsent,
} from "@/lib/consent/cookie-consent";
import { useCookieConsent } from "@/hooks/useCookieConsent";

export function CookieConsentManager() {
  const consent = useCookieConsent();
  const [editing, setEditing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const openSettings = () => {
      setAnalytics(consent?.analytics ?? false);
      setMarketing(consent?.marketing ?? false);
      setEditing(true);
    };

    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, openSettings);
    return () =>
      window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, openSettings);
  }, [consent]);

  if (consent && !editing) return null;

  const acceptAll = () => {
    saveCookieConsent({ analytics: true, marketing: true });
    setEditing(false);
  };

  const rejectOptional = () => {
    saveCookieConsent({ analytics: false, marketing: false });
    clearAnalyticsStorage();
    setEditing(false);
  };

  const savePreferences = () => {
    saveCookieConsent({ analytics, marketing });
    if (!analytics) clearAnalyticsStorage();
    setEditing(false);
  };

  const clearAnalyticsStorage = () => {
    clearGrowthVisitorId();
    try {
      window.sessionStorage.removeItem(UTM_STORAGE_KEY);
    } catch {
      // Keep the preference change usable when browser storage is unavailable.
    }
  };

  return (
    <section
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-zaltyko-primary/25 bg-white p-4 text-zaltyko-text-main shadow-2xl sm:bottom-5 sm:p-6"
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-zaltyko-primary">
            Privacidad
          </p>
          <h2 id="cookie-consent-title" className="mt-1 text-lg font-bold">
            {editing
              ? "Configura tus cookies"
              : "Tú decides cómo usamos las cookies"}
          </h2>
          <p
            id="cookie-consent-description"
            className="mt-2 text-sm leading-relaxed text-zaltyko-text-secondary"
          >
            Las necesarias mantienen la sesión y protegen la web. Con tu
            permiso, usamos analítica para mejorar Zaltyko y, si lo eliges,
            medición de campañas. Puedes cambiar de opinión en cualquier momento
            desde «Configurar cookies» en el pie de página.{" "}
            <Link
              href="/politica-privacidad#cookies"
              className="font-semibold underline underline-offset-2"
            >
              Más información
            </Link>
          </p>
        </div>

        {editing ? (
          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="sr-only">Preferencias de cookies</legend>
            <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <input
                id="cookies-necessary"
                type="checkbox"
                checked
                disabled
                className="h-4 w-4 accent-zaltyko-primary"
              />
              <label htmlFor="cookies-necessary">
                Necesarias · siempre activas
              </label>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                className="h-4 w-4 accent-zaltyko-primary"
              />
              Analítica · PostHog y Vercel
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                className="h-4 w-4 accent-zaltyko-primary"
              />
              Campañas · Google Ads
            </label>
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {editing ? (
            <>
              <button
                type="button"
                onClick={rejectOptional}
                className="min-h-11 rounded-lg border border-zaltyko-navy px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zaltyko-primary"
              >
                Rechazar opcionales
              </button>
              <button
                type="button"
                onClick={savePreferences}
                className="min-h-11 rounded-lg border border-zaltyko-navy px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zaltyko-primary"
              >
                Guardar preferencias
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="min-h-11 rounded-lg bg-zaltyko-primary px-4 py-2 text-sm font-bold text-white hover:bg-zaltyko-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zaltyko-primary"
              >
                Aceptar todas
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={rejectOptional}
                className="min-h-11 rounded-lg border border-zaltyko-navy px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zaltyko-primary"
              >
                Rechazar opcionales
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-h-11 rounded-lg border border-zaltyko-navy px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zaltyko-primary"
              >
                Configurar
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="min-h-11 rounded-lg bg-zaltyko-primary px-4 py-2 text-sm font-bold text-white hover:bg-zaltyko-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zaltyko-primary"
              >
                Aceptar todas
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
