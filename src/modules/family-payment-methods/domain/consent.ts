import { createHash } from "node:crypto";

/**
 * Pago automático de cuotas (cobro automático, Fase 2): texto que la familia
 * acepta al guardar una tarjeta o domiciliar el pago en la cuenta Stripe
 * conectada de su academia. En esta fase no se cobra nada.
 *
 * El texto es un BORRADOR sin valor legal hasta que el abogado responda (L3).
 * Para la domiciliación, el texto de la orden lo muestra el propio formulario
 * de Stripe con la academia como acreedora; Zaltyko no lo redacta.
 */
export type PaymentMethodKind = "card" | "sepa_debit";

/** Única versión vigente del texto. Cambiar el texto exige cambiar la versión. */
export const FAMILY_PAYMENT_CONSENT_VERSION = "borrador-2026-11-16";

/**
 * Devuelve el texto exacto que se muestra y se acepta. Lanza si la versión no
 * es la vigente, si el método no existe o si falta el nombre de la academia:
 * nunca se guarda una aceptación de un texto que no se ha mostrado.
 */
export function renderConsentText(input: {
  kind: PaymentMethodKind;
  academyName: string;
  version: string;
}): string {
  if (input.version !== FAMILY_PAYMENT_CONSENT_VERSION) {
    throw new Error("Versión del texto de pago automático desconocida");
  }
  const academy = input.academyName.trim();
  if (academy.length === 0) {
    throw new Error("Falta el nombre de la academia en el texto de pago automático");
  }
  const closing =
    "Puedo dejar de pagar automáticamente cuando quiera desde este portal. " +
    "Los cobros ya enviados siguen su curso.";
  switch (input.kind) {
    case "card":
      return (
        `Autorizo a ${academy} a cobrar automáticamente en esta tarjeta el importe ` +
        `de cada cuota que emita a mi familia. ${closing}`
      );
    case "sepa_debit":
      return (
        `Autorizo a ${academy} a cobrar automáticamente en esta cuenta bancaria, ` +
        `por domiciliación, el importe de cada cuota que emita a mi familia. ${closing}`
      );
    default: {
      const unknownKind: never = input.kind;
      throw new Error(`Método de pago desconocido: ${String(unknownKind)}`);
    }
  }
}

/** SHA-256 (hex en minúsculas) de los bytes UTF-8 del texto exacto aceptado. */
export function consentTextSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
