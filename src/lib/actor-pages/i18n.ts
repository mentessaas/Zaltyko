/**
 * Strings traducibles del render público de actor_pages.
 * Centraliza los textos UI (no el contenido propio de cada página).
 *
 * Sprint T4.2: MVP con es + en. Locale viene de getLocaleFromRequest().
 */

import type { Locale } from "@/i18n";

export type PublicUiStrings = {
  contactTitle: string;
  emailLabel: string;
  phoneLabel: string;
  poweredBy: string;
  notFoundTitle: string;
  noImage: string;
};

const STRINGS: Record<Locale, PublicUiStrings> = {
  es: {
    contactTitle: "Contacto",
    emailLabel: "Email:",
    phoneLabel: "Teléfono:",
    poweredBy: "Powered by Zaltyko",
    notFoundTitle: "Página no encontrada",
    noImage: "Sin imagen",
  },
  en: {
    contactTitle: "Contact",
    emailLabel: "Email:",
    phoneLabel: "Phone:",
    poweredBy: "Powered by Zaltyko",
    notFoundTitle: "Page not found",
    noImage: "No image",
  },
};

export function publicUi(locale: Locale | string): PublicUiStrings {
  const l = (locale === "en" ? "en" : "es") as Locale;
  return STRINGS[l];
}
