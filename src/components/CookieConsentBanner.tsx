"use client";

/**
 * ZAL-156.2 [GTM-DEP.2] — Banner de consent de cookies.
 *
 * Banner minimalista que se muestra solo cuando el consent está en estado
 * "unset" (el usuario todavía no optó). Ofrece dos opciones mutuamente
 * excluyentes — Aceptar o Rechazar — sin botón de cierre "X" porque sería
 * un patrón oscuro (cerrar sin elegir ≠ denegar, y nuestro gate trata
 * "unset" y "revoked" igual: descartan el `page_view`).
 *
 * Decisiones:
 *
 *   - Persiste la elección vía `writeConsent` del store canónico. Una
 *     vez que el usuario opta, el banner no vuelve a aparecer aunque
 *     recargue la página.
 *   - WCAG 2.2 AA: `role="dialog"`, `aria-labelledby`, `aria-describedby`,
 *     foco inicial en el primer botón (Aceptar), texto con contraste
 *     alto, animaciones respetan `prefers-reduced-motion`.
 *   - Mobile-first: ocupa el ancho disponible en <sm, esquina inferior
 *     derecha en >=sm. `bottom-20` deja sitio al `BottomNav`.
 *   - Idempotente con `subscribeConsent`: si el consent cambia por
 *     otro camino (p. ej. una API futura, o el `storage` event de
 *     otra pestaña), el banner se oculta solo.
 *   - Copy alineado con `vault/04-Marketing/Mensajes aprobados.md`:
 *     "privacidad por diseño" (no se promete "RGPD Compliant").
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { writeConsent } from "@/lib/consent/store";
import { subscribeConsent } from "@/lib/consent/state";

const HEADING_ID = "cookie-consent-heading";
const DESCRIPTION_ID = "cookie-consent-description";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Estado inicial — si ya optó en una visita previa, no aparece.
    setVisible(readShouldShow());
    // Si el consent cambia (otra pestaña via storage event, o cualquier
    // productor que llame writeConsent), el banner se sincroniza.
    const unsubscribe = subscribeConsent((snapshot) => {
      setVisible(snapshot.value === "unset");
    });
    return unsubscribe;
  }, []);

  // No renderizar durante SSR ni en la primera hidratación para evitar
  // parpadeo si el usuario ya optó.
  if (!mounted || !visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={HEADING_ID}
      aria-describedby={DESCRIPTION_ID}
      className="fixed inset-x-4 bottom-20 z-50 sm:left-auto sm:right-4 sm:max-w-md animate-in slide-in-from-bottom-4 fade-in duration-300 motion-reduce:animate-none"
    >
      <div className="bg-white border border-zaltyko-border rounded-2xl shadow-lg p-4">
        <h2
          id={HEADING_ID}
          className="font-display font-semibold text-zaltyko-text-main"
        >
          Cookies de analítica
        </h2>
        <p
          id={DESCRIPTION_ID}
          className="text-sm text-zaltyko-text-muted mt-1"
        >
          Usamos cookies para entender cómo se usa Zaltyko y mejorar el
          producto. Tu academia no se ve afectada si las rechazas. Más
          información en nuestra política de privacidad.
        </p>

        <div className="flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => writeConsent("revoked")}
            className="sm:min-w-[7rem]"
          >
            Rechazar
          </Button>
          <Button
            size="sm"
            onClick={() => writeConsent("granted")}
            autoFocus
            className="sm:min-w-[7rem]"
          >
            Aceptar
          </Button>
        </div>
      </div>
    </div>
  );
}

function readShouldShow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("zaltyko.consent.v1");
    // "unset" (clave ausente) o valor corrupto → mostrar.
    // "granted" o "revoked" → no mostrar.
    return raw !== "granted" && raw !== "revoked";
  } catch {
    // storage bloqueado (modo privado en algunos browsers) → mostrar.
    return true;
  }
}
