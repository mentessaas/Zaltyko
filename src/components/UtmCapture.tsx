"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { captureUtm } from "@/lib/gtm/utm";

/**
 * ZAL-157 [GTM-DEP.1] — captura UTM first-touch en cada page view.
 *
 * El root layout NO se vuelve a montar en las navegaciones cliente del App
 * Router, así que un `useEffect([])` solo veía la primera URL de la sesión:
 * un touch que aparecía en una URL alcanzada por navegación SPA (por ejemplo
 * un link interno a `/precios?utm_source=...`) nunca se persistía y se perdía
 * al seguir al onboarding. Por eso el efecto depende de `pathname` y de la
 * query string: se re-ejecuta en cada page view real.
 *
 * `captureUtm()` es idempotente y respeta el first-touch, así que
 * re-ejecutarlo con otros UTMs no sobrescribe el touch original; solo
 * habilita capturar el primero cuando llega por navegación cliente. Cuando
 * el signup termina, `clearStoredUtm()` purga el storage para que la
 * siguiente sesión no herede UTMs de la anterior.
 *
 * No renderiza nada; solo dispara side effects.
 */
function UtmCaptureEffect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    captureUtm();
  }, [pathname, search]);

  return null;
}

/**
 * `useSearchParams()` exige un boundary de Suspense para no forzar render
 * dinámico de todo el árbol estático que cuelga del root layout.
 */
export function UtmCapture() {
  return (
    <Suspense fallback={null}>
      <UtmCaptureEffect />
    </Suspense>
  );
}
