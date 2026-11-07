import type { OwnerSaasBillingInterval } from "./owner-saas-billing-types";

export type SaasPendingAction = "checkout" | "portal" | "trial";
export type StoredSaasCommand = {
  organizationId: string;
  action: SaasPendingAction;
  planCode?: "starter" | "growth";
  billingInterval?: OwnerSaasBillingInterval;
  key: string;
  serializedBody: string;
};

export type StoredCommandRead =
  | { status: "empty" }
  | { status: "pending"; command: StoredSaasCommand }
  | { status: "invalid" }
  | { status: "unavailable" };

export function saasCommandStorageKey(organizationId: string) {
  return `owner-saas-pending-command:v1:${organizationId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function decodeStoredSaasCommand(value: unknown, organizationId: string): StoredSaasCommand | null {
  if (!isRecord(value)) return null;
  const { organizationId: storedOrg, action, planCode, billingInterval, key, serializedBody } = value;
  if (storedOrg !== organizationId || typeof key !== "string" || key.length < 8 || key.length > 200 || typeof serializedBody !== "string" || serializedBody.length > 4096) return null;
  let body: unknown;
  try { body = JSON.parse(serializedBody); } catch { return null; }
  if (!isRecord(body) || body.organizationId !== organizationId) return null;
  if (action === "checkout") {
    if (Object.keys(value).sort().join(",") !== "action,billingInterval,key,organizationId,planCode,serializedBody") return null;
    if ((planCode !== "starter" && planCode !== "growth") || (billingInterval !== "month" && billingInterval !== "year")) return null;
    if (Object.keys(body).sort().join(",") !== "billingInterval,organizationId,planCode" || body.planCode !== planCode || body.billingInterval !== billingInterval) return null;
    return { organizationId, action, planCode, billingInterval, key, serializedBody };
  }
  if ((action === "portal" || action === "trial") && Object.keys(value).sort().join(",") === "action,key,organizationId,serializedBody" && planCode === undefined && billingInterval === undefined && Object.keys(body).length === 1) {
    return { organizationId, action, key, serializedBody };
  }
  return null;
}

export function readStoredSaasCommand(organizationId: string): StoredCommandRead {
  try {
    const legacyPrefix = `owner-saas-idempotency:${organizationId}:`;
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(legacyPrefix)) return { status: "invalid" };
    }
    const raw = window.sessionStorage.getItem(saasCommandStorageKey(organizationId));
    if (raw === null) return { status: "empty" };
    if (raw.length > 8192) return { status: "invalid" };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { status: "invalid" }; }
    const command = decodeStoredSaasCommand(parsed, organizationId);
    return command ? { status: "pending", command } : { status: "invalid" };
  } catch { return { status: "unavailable" }; }
}

export function persistStoredSaasCommand(command: StoredSaasCommand): boolean {
  try {
    const validated = decodeStoredSaasCommand(command, command.organizationId);
    if (!validated) return false;
    const key = saasCommandStorageKey(command.organizationId);
    const serialized = JSON.stringify(validated);
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch { return false; }
}

export function clearStoredSaasCommand(organizationId: string, expectedCommand: StoredSaasCommand): boolean {
  try {
    const expected = decodeStoredSaasCommand(expectedCommand, organizationId);
    if (!expected) return false;
    const key = saasCommandStorageKey(organizationId);
    const expectedRaw = JSON.stringify(expected);
    if (window.sessionStorage.getItem(key) !== expectedRaw) return false;
    window.sessionStorage.removeItem(key);
    return true;
  } catch { return false; }
}
