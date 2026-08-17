"use client";

import { useEffect } from "react";

import { captureUtm } from "@/lib/gtm/utm";

/**
 * ZAL-157 [GTM-DEP.1] — captura UTM first-touch en cada page view.
 *
 * Se monta una sola vez en el root layout. `captureUtm()` es idempotente:
 * la primera vez persiste en sessionStorage (si la URL trae UTMs), las
 * siguientes llamadas respetan el primer touch. Cuando el signup termina,
 * `clearStoredUtm()` purga el storage para que la siguiente sesión no
 * herede UTMs de la anterior.
 *
 * No renderiza nada; solo dispara side effects al montar.
 */
export function UtmCapture() {
  useEffect(() => {
    captureUtm();
  }, []);
  return null;
}