import { describe, expect, it } from "vitest";

/**
 * Cobro automático (Fase 3): errores de Stripe al leer un cobro, permanentes
 * (hace falta soporte) o pasajeros (se reintenta). Solo datos sintéticos.
 */

import {
  isPermanentStripeError,
  stripeReadFailureOf,
} from "@/modules/family-collection/domain/stripe-read-error";

/** Error con la forma que le da stripe-node 22 (`type` = clase, `rawType` = tipo de la API). */
function stripeError(fields: { type: string; rawType?: string; code?: string; statusCode?: number }) {
  return Object.assign(new Error("mensaje de Stripe con datos que no se registran"), fields);
}

describe("stripeReadFailureOf", () => {
  it.each([
    ["sin permiso sobre la cuenta (403)", stripeError({ type: "StripePermissionError", rawType: "invalid_request_error", statusCode: 403 }), "StripePermissionError", null],
    ["cuenta no válida", stripeError({ type: "StripePermissionError", rawType: "invalid_request_error", code: "account_invalid", statusCode: 403 }), "StripePermissionError", "account_invalid"],
    ["account_invalid aunque llegue con otra clase", stripeError({ type: "StripeAuthenticationError", code: "account_invalid", statusCode: 401 }), "StripeAuthenticationError", "account_invalid"],
    ["cobro inexistente", stripeError({ type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "resource_missing", statusCode: 404 }), "StripeInvalidRequestError", "resource_missing"],
    ["tipo permission_error de la API", stripeError({ type: "StripeAPIError", rawType: "permission_error" }), "StripeAPIError", null],
  ])("%s: permanente", (_label, error, errorName, errorCode) => {
    expect(stripeReadFailureOf(error)).toEqual({ errorName, errorCode, permanent: true });
    expect(isPermanentStripeError(error)).toBe(true);
  });

  it.each([
    ["red", stripeError({ type: "StripeConnectionError" }), "StripeConnectionError", null],
    ["límite de peticiones", stripeError({ type: "StripeRateLimitError", code: "rate_limit", statusCode: 429 }), "StripeRateLimitError", "rate_limit"],
    ["error interno de Stripe", stripeError({ type: "StripeAPIError", rawType: "api_error", statusCode: 500 }), "StripeAPIError", null],
    ["otra petición inválida", stripeError({ type: "StripeInvalidRequestError", code: "parameter_invalid_empty", statusCode: 400 }), "StripeInvalidRequestError", "parameter_invalid_empty"],
  ])("%s: pasajero", (_label, error, errorName, errorCode) => {
    expect(stripeReadFailureOf(error)).toEqual({ errorName, errorCode, permanent: false });
    expect(isPermanentStripeError(error)).toBe(false);
  });

  it("un error del adaptador usa su mensaje como código; cualquier otra cosa no deja rastro del mensaje", () => {
    expect(stripeReadFailureOf(new Error("FAMILY_COLLECTION_INVALID_PAYMENT_INTENT"))).toEqual({
      errorName: "Error",
      errorCode: "FAMILY_COLLECTION_INVALID_PAYMENT_INTENT",
      permanent: false,
    });
    const failure = stripeReadFailureOf(new Error("IBAN ES00 0000 y nombre de la familia"));
    expect(failure).toEqual({ errorName: "Error", errorCode: null, permanent: false });
    expect(JSON.stringify(failure)).not.toContain("IBAN");
    expect(stripeReadFailureOf("texto")).toEqual({ errorName: "unknown", errorCode: null, permanent: false });
    expect(stripeReadFailureOf(null)).toEqual({ errorName: "unknown", errorCode: null, permanent: false });
  });

  it("un código con forma rara no se registra", () => {
    expect(stripeReadFailureOf(stripeError({ type: "StripeInvalidRequestError", code: "algo raro; con espacios" }))).toEqual({
      errorName: "StripeInvalidRequestError",
      errorCode: null,
      permanent: false,
    });
  });
});
