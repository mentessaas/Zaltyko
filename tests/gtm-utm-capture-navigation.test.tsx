/**
 * @vitest-environment jsdom
 */
/**
 * ZAL-157 [GTM-DEP.1] — regresión P1 de ZAL-198: la captura debe ser global
 * en el App Router.
 *
 * El root layout no se re-monta en las navegaciones cliente, así que la
 * versión previa (`useEffect(..., [])`) solo veía la primera URL de la
 * sesión: un touch que aparecía en una URL alcanzada por navegación SPA
 * nunca llegaba a sessionStorage y se perdía al seguir al onboarding.
 *
 * Aquí se simula esa navegación moviendo `usePathname`/`useSearchParams`
 * (mockeados) y comprobando que el touch queda persistido, además de que la
 * regla first-touch sigue ganando ante un segundo touch.
 */

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_STORAGE_KEY } from "@/lib/gtm/utm";

const navState = { pathname: "/", search: "" };

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useSearchParams: () => new URLSearchParams(navState.search),
}));

import { UtmCapture } from "@/components/UtmCapture";

/** Mueve la URL como lo haría una navegación cliente del App Router. */
function navigateTo(pathname: string, search: string) {
  navState.pathname = pathname;
  navState.search = search;
  window.history.replaceState({}, "", `${pathname}${search ? `?${search}` : ""}`);
}

function storedUtm(): Record<string, string> | null {
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, string>) : null;
}

describe("UtmCapture — captura en navegación cliente (ZAL-198 P1)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    navigateTo("/", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persiste el touch que llega en una URL alcanzada por navegación SPA", () => {
    const { rerender } = render(<UtmCapture />);
    expect(storedUtm()).toBeNull();

    // Navegación interna a una landing con UTMs: el layout NO se re-monta.
    navigateTo("/precios", "utm_source=instagram&utm_medium=social");
    rerender(<UtmCapture />);

    expect(storedUtm()).toMatchObject({
      utm_source: "instagram",
      utm_medium: "social",
      utm_landing_path: "/precios",
    });
  });

  it("re-captura cuando cambia solo la query string dentro del mismo pathname", () => {
    const { rerender } = render(<UtmCapture />);
    navigateTo("/", "utm_campaign=zal_onboarding_ago_awareness");
    rerender(<UtmCapture />);

    expect(storedUtm()).toMatchObject({
      utm_campaign: "zal_onboarding_ago_awareness",
    });
  });

  it("mantiene el first-touch cuando una navegación posterior trae otro UTM", () => {
    navigateTo("/", "utm_source=instagram&utm_medium=social");
    const { rerender } = render(<UtmCapture />);
    expect(storedUtm()).toMatchObject({ utm_source: "instagram" });

    navigateTo("/precios", "utm_source=google_ads&utm_medium=cpc");
    rerender(<UtmCapture />);

    expect(storedUtm()).toMatchObject({
      utm_source: "instagram",
      utm_medium: "social",
      utm_landing_path: "/",
    });
  });

  it("no persiste nada cuando ninguna navegación trae UTMs", () => {
    const { rerender } = render(<UtmCapture />);
    navigateTo("/precios", "");
    rerender(<UtmCapture />);
    navigateTo("/auth/register", "");
    rerender(<UtmCapture />);

    expect(storedUtm()).toBeNull();
  });
});
