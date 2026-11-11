/**
 * Canonical JSON, SHA-256 and the small parsers of untyped Stripe and SQL
 * values, plus the confirmation request hash.
 */
import { createHash } from "node:crypto";
import { normalizeSaasReconciliationReason } from "./validation";

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function dateIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function stringId(value: unknown): string | null {
  if (typeof value === "string") return value;
  const nested = record(value);
  return typeof nested?.id === "string" ? nested.id : null;
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function objectRows<T>(result: { rows: unknown[] }): T[] {
  return result.rows as T[];
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  const source = record(value);
  if (!source) return value;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, canonicalValue(source[key])])
  );
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

/**
 * @internal Uso exclusivo de reconciliation/*; la API pública está en
 * reconciliation-service.ts.
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createSaasReconciliationRequestHash(input: {
  actorUserId: string;
  previewTokenSha256: string;
  reason: string;
}): string {
  return sha256(
    canonicalJson({
      version: 1,
      actorUserId: input.actorUserId,
      previewTokenSha256: input.previewTokenSha256,
      reason: normalizeSaasReconciliationReason(input.reason),
    })
  );
}
