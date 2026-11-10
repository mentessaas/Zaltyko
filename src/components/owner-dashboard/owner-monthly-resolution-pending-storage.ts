/**
 * sessionStorage record of the monthly-invoice resolution command awaiting its
 * result: exact body, idempotency key and scope, validated on every read.
 * Extracted from OwnerMonthlyInvoiceResolutionPanel.
 */

import {
  isDateValue,
  isUuid,
  resolutionScopeKey,
} from "./owner-monthly-resolution-model";

export type PendingResolutionCommand = {
  scopeKey: string;
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  actionKey: string;
  operation: "create-price-plan" | "assign-tariff" | "associate-family";
  endpoint: string;
  method: "POST" | "PATCH";
  key: string;
  hasAmbiguousAttempt: boolean;
  body: unknown;
  serializedBody: string;
};

export const PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY =
  "zaltyko:pending-monthly-invoice-resolution:v1";
const pendingResolutionStorageVersion = 1;
const maxPendingResolutionStorageLength = 65_536;

type PendingResolutionStorageRead =
  | { kind: "none" }
  | { kind: "pending"; command: PendingResolutionCommand }
  | { kind: "invalid" }
  | { kind: "unavailable" };

type PendingResolutionStorageRecord = Omit<
  PendingResolutionCommand,
  "body"
> & {
  version: typeof pendingResolutionStorageVersion;
  fingerprint: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === keys[index])
  );
}

function isUniqueUuidArray(value: unknown, minimum = 1, maximum = 100): value is string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    return false;
  }
  return value.every(isUuid) && new Set(value).size === value.length;
}

function pendingResolutionFingerprint(
  command: Omit<PendingResolutionCommand, "body" | "hasAmbiguousAttempt">
): string {
  // This binds the persisted scope, route, idempotency key, and exact body bytes.
  // It detects partial or mismatched sessionStorage records; server authorization
  // and idempotency remain the security boundary.
  return JSON.stringify([
    command.scopeKey,
    command.organizationId,
    command.locationId,
    command.servicePeriod,
    command.actionKey,
    command.operation,
    command.endpoint,
    command.method,
    command.key,
    command.serializedBody,
  ]);
}

function validatePendingResolutionBody(
  operation: PendingResolutionCommand["operation"],
  actionKey: string,
  organizationId: string,
  locationId: string,
  serializedBody: string
): unknown | null {
  let value: unknown;
  try {
    value = JSON.parse(serializedBody);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.organizationId !== organizationId || value.locationId !== locationId) {
    return null;
  }

  if (operation === "create-price-plan") {
    if (
      !actionKey.startsWith("tariff:") ||
      !isUuid(actionKey.slice("tariff:".length)) ||
      !hasExactKeys(value, ["organizationId", "locationId", "name", "amountCents", "coverage"]) ||
      typeof value.name !== "string" || value.name.trim().length === 0 ||
      value.name.trim() !== value.name || value.name.length > 100 ||
      typeof value.amountCents !== "number" ||
      !Number.isSafeInteger(value.amountCents) ||
      (value.amountCents as number) <= 0 ||
      !isRecord(value.coverage) ||
      !hasExactKeys(value.coverage, ["classTemplateIds", "startsOn", "endsOn"]) ||
      !isUniqueUuidArray(value.coverage.classTemplateIds, 1, 100) ||
      !isDateValue(value.coverage.startsOn) ||
      !(value.coverage.endsOn === null ||
        (isDateValue(value.coverage.endsOn) && value.coverage.endsOn >= value.coverage.startsOn))
    ) return null;
    return value;
  }

  if (operation === "assign-tariff") {
    const enrollmentId = actionKey.startsWith("tariff:")
      ? actionKey.slice("tariff:".length)
      : "";
    if (
      !isUuid(enrollmentId) ||
      !hasExactKeys(value, ["organizationId", "locationId", "pricePlanId", "startsOn"]) ||
      !isUuid(value.pricePlanId) ||
      !isDateValue(value.startsOn)
    ) return null;
    return value;
  }

  const familyAction = actionKey.startsWith("family:");
  const payerAction = actionKey.startsWith("payer:");
  const actionTargetId = familyAction
    ? actionKey.slice("family:".length)
    : payerAction
      ? actionKey.slice("payer:".length)
      : "";
  if (!isUuid(actionTargetId)) return null;

  const hasFamilyId = Object.hasOwn(value, "familyId");
  if (
    !hasExactKeys(value, hasFamilyId
      ? ["organizationId", "locationId", "familyId", "athleteIds", "payer", "effectiveFrom"]
      : ["organizationId", "locationId", "athleteIds", "payer", "effectiveFrom"]) ||
    (hasFamilyId && !isUuid(value.familyId)) ||
    !isUniqueUuidArray(value.athleteIds, 1, 50) ||
    (familyAction && value.athleteIds.length !== 1) ||
    (payerAction && value.familyId !== actionTargetId) ||
    !isDateValue(value.effectiveFrom) ||
    !isRecord(value.payer)
  ) return null;

  const payer = value.payer;
  const hasConfirmation = Object.hasOwn(payer, "confirmPrimaryPayerChange");
  if (Object.hasOwn(payer, "familyPayerId")) {
    if (
      !hasFamilyId ||
      !hasExactKeys(payer, hasConfirmation
        ? ["familyPayerId", "confirmPrimaryPayerChange"]
        : ["familyPayerId"]) ||
      !isUuid(payer.familyPayerId) ||
      (hasConfirmation && typeof payer.confirmPrimaryPayerChange !== "boolean")
    ) return null;
  } else if (
    !hasExactKeys(payer, hasConfirmation
      ? ["givenName", "familyName", "relationship", "confirmPrimaryPayerChange"]
      : ["givenName", "familyName", "relationship"]) ||
    typeof payer.givenName !== "string" || payer.givenName.trim().length === 0 ||
    payer.givenName.trim() !== payer.givenName || payer.givenName.length > 100 ||
    typeof payer.familyName !== "string" || payer.familyName.trim().length === 0 ||
    payer.familyName.trim() !== payer.familyName || payer.familyName.length > 100 ||
    !["parent", "legal_guardian", "foster_guardian", "other"].includes(String(payer.relationship)) ||
    (hasConfirmation && typeof payer.confirmPrimaryPayerChange !== "boolean")
  ) return null;

  return value;
}

function decodePendingResolutionCommand(raw: string): PendingResolutionCommand | null {
  if (raw.length > maxPendingResolutionStorageLength) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !hasExactKeys(value, [
      "version", "scopeKey", "organizationId", "locationId", "servicePeriod",
      "actionKey", "operation", "endpoint", "method", "key",
      "hasAmbiguousAttempt", "serializedBody", "fingerprint",
    ])) return null;
    if (
      value.version !== pendingResolutionStorageVersion ||
      !isUuid(value.organizationId) || !isUuid(value.locationId) ||
      typeof value.servicePeriod !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.servicePeriod) ||
      typeof value.actionKey !== "string" ||
      !["create-price-plan", "assign-tariff", "associate-family"].includes(String(value.operation)) ||
      (value.method !== "POST" && value.method !== "PATCH") ||
      typeof value.key !== "string" || value.key.trim() !== value.key ||
      value.key.length < 8 || value.key.length > 180 ||
      typeof value.hasAmbiguousAttempt !== "boolean" ||
      typeof value.serializedBody !== "string" || value.serializedBody.length > 24_000 ||
      typeof value.fingerprint !== "string"
    ) return null;

    const operation = value.operation as PendingResolutionCommand["operation"];
    const expectedScopeKey = resolutionScopeKey({
      organizationId: value.organizationId,
      locationId: value.locationId,
      servicePeriod: value.servicePeriod,
      actionKey: value.actionKey,
    });
    if (value.scopeKey !== expectedScopeKey) return null;

    const expectedKeyPrefix = operation === "create-price-plan"
      ? "owner-monthly-price-plan"
      : operation === "assign-tariff"
        ? "owner-price-assignment"
        : "owner-family-association";
    const keyNonce = value.key.startsWith(`${expectedKeyPrefix}:`)
      ? value.key.slice(expectedKeyPrefix.length + 1)
      : "";
    if (!isUuid(keyNonce)) return null;

    const expectedEndpoint = operation === "create-price-plan"
      ? "/api/v1/owner/billing/price-plans"
      : operation === "assign-tariff"
        ? `/api/v1/owner/enrollments/${encodeURIComponent(value.actionKey.slice("tariff:".length))}/price-plan`
        : "/api/v1/owner/families/associations";
    const expectedMethod = operation === "assign-tariff" ? "PATCH" : "POST";
    if (value.endpoint !== expectedEndpoint || value.method !== expectedMethod) return null;

    const commandWithoutBody: Omit<
      PendingResolutionCommand,
      "body" | "hasAmbiguousAttempt"
    > = {
      scopeKey: value.scopeKey,
      organizationId: value.organizationId,
      locationId: value.locationId,
      servicePeriod: value.servicePeriod,
      actionKey: value.actionKey,
      operation,
      endpoint: value.endpoint,
      method: value.method,
      key: value.key,
      serializedBody: value.serializedBody,
    };
    if (value.fingerprint !== pendingResolutionFingerprint(commandWithoutBody)) return null;
    const body = validatePendingResolutionBody(
      operation,
      value.actionKey,
      value.organizationId,
      value.locationId,
      value.serializedBody
    );
    if (!body) return null;

    return {
      scopeKey: value.scopeKey,
      organizationId: value.organizationId,
      locationId: value.locationId,
      servicePeriod: value.servicePeriod,
      actionKey: value.actionKey,
      operation,
      endpoint: value.endpoint,
      method: value.method,
      key: value.key,
      hasAmbiguousAttempt: value.hasAmbiguousAttempt,
      body,
      serializedBody: value.serializedBody,
    };
  } catch {
    return null;
  }
}

export function readPendingResolutionCommand(): PendingResolutionStorageRead {
  try {
    const raw = window.sessionStorage.getItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY);
    if (raw === null) return { kind: "none" };
    const command = decodePendingResolutionCommand(raw);
    return command ? { kind: "pending", command } : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}

function pendingResolutionRecord(command: PendingResolutionCommand): PendingResolutionStorageRecord {
  const { body: _body, ...persisted } = command;
  return {
    version: pendingResolutionStorageVersion,
    ...persisted,
    fingerprint: pendingResolutionFingerprint(command),
  };
}

function samePendingResolutionCommand(
  left: PendingResolutionCommand,
  right: PendingResolutionCommand,
  includeAmbiguous = true
): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    left.organizationId === right.organizationId &&
    left.locationId === right.locationId &&
    left.servicePeriod === right.servicePeriod &&
    left.actionKey === right.actionKey &&
    left.operation === right.operation &&
    left.endpoint === right.endpoint &&
    left.method === right.method &&
    left.key === right.key &&
    left.serializedBody === right.serializedBody &&
    (!includeAmbiguous || left.hasAmbiguousAttempt === right.hasAmbiguousAttempt)
  );
}

export function persistPendingResolutionCommand(
  command: PendingResolutionCommand,
  options: { allowCreate?: boolean; allowAmbiguousUpgrade?: boolean } = {}
): boolean {
  try {
    const read = readPendingResolutionCommand();
    if (read.kind === "unavailable" || read.kind === "invalid") return false;
    if (read.kind === "none") {
      if (!options.allowCreate) return false;
    } else if (!samePendingResolutionCommand(read.command, command, false)) {
      return false;
    } else if (read.command.hasAmbiguousAttempt !== command.hasAmbiguousAttempt) {
      if (
        !options.allowAmbiguousUpgrade ||
        !command.hasAmbiguousAttempt ||
        read.command.hasAmbiguousAttempt
      ) return false;
    } else {
      return true;
    }

    window.sessionStorage.setItem(
      PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY,
      JSON.stringify(pendingResolutionRecord(command))
    );
    const verified = readPendingResolutionCommand();
    return verified.kind === "pending" &&
      samePendingResolutionCommand(verified.command, command);
  } catch {
    return false;
  }
}

export function pendingResolutionCommandMatchesStorage(
  command: PendingResolutionCommand
): boolean {
  const read = readPendingResolutionCommand();
  return read.kind === "pending" && samePendingResolutionCommand(read.command, command);
}

export function clearPendingResolutionCommand(
  command: PendingResolutionCommand
): boolean {
  try {
    const stored = readPendingResolutionCommand();
    // Another mounted instance may already have cleared this same key after a
    // validated terminal receipt. The caller only clears after validating its
    // own success or definitive first-attempt rejection.
    if (stored.kind === "none") return true;
    if (
      stored.kind !== "pending" ||
      !samePendingResolutionCommand(stored.command, command)
    ) return false;
    window.sessionStorage.removeItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY);
    return window.sessionStorage.getItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}
