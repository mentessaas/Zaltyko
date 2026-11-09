import type { GroupMembershipCommand } from "./owner-pending-group-membership";
import type {
  GroupAthleteReceipt,
  PendingGroupAthleteCreate,
} from "./owner-pending-group-athlete";

export type GroupsBundle = Awaited<
  ReturnType<
    typeof import("@/modules/groups/application/group-management-service").getOwnerGroupsPageData
  >
>;

export type Candidate = { id: string; name: string };
export type GroupCreateField = "name" | "programId" | "locationId" | "capacity";
export type GroupCreateFieldErrors = Partial<Record<GroupCreateField, string>>;
export type GroupCreateValidationState = {
  fieldErrors: GroupCreateFieldErrors;
  summary: string;
};

export const GROUP_CREATE_FIELD_ERROR_IDS: Record<GroupCreateField, string> = {
  name: "group-create-name-error",
  programId: "group-create-program-error",
  locationId: "group-create-location-error",
  capacity: "group-create-capacity-error",
};

export const GROUP_CREATE_NATIVE_FIELD_ERRORS: Record<GroupCreateField, string> = {
  name: "Escribe el nombre del grupo.",
  programId: "Selecciona una actividad.",
  locationId: "Selecciona una sede.",
  capacity: "Introduce un número entero entre 1 y 5000.",
};

export function summarizeGroupCreateFieldErrors(errors: GroupCreateFieldErrors): string {
  const fields = (Object.keys(GROUP_CREATE_FIELD_ERROR_IDS) as GroupCreateField[])
    .filter((field) => Boolean(errors[field]));
  return [...new Set(fields.map((field) => errors[field]).filter(Boolean))].join(" ");
}

export type PendingMembershipCommand = GroupMembershipCommand | Readonly<{
  organizationId: string;
  groupId: string;
  kind: "create";
  endpoint: string;
  method: "POST";
  body: string;
  idempotencyKey: string;
}>;

export type CreateAthleteRecoveryState = {
  scope: string;
  status: "checking" | "needs-input" | "complete" | "blocked" | "none";
  intent?: PendingGroupAthleteCreate;
  receipt?: GroupAthleteReceipt;
  detail?: string;
};

export type GroupCreatePayload = {
  organizationId: string;
  locationId: string;
  programId: string;
  name: string;
  capacity: number | null;
};

export type PendingGroupCreate = {
  version: 1;
  organizationId: string;
  idempotencyKey: string;
  body: string;
};

export type PendingGroupCreateState =
  | {
      kind: "replayable";
      organizationId: string;
      command: PendingGroupCreate;
    }
  | { kind: "legacy"; organizationId: string }
  | { kind: "invalid"; organizationId: string }
  | { kind: "unavailable"; organizationId: string };

export function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

export function responseError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "No se pudo completar el cambio. Inténtalo de nuevo.";
  }
  const detail = "detail" in payload ? payload.detail : undefined;
  const message = "message" in payload ? payload.message : undefined;
  return typeof detail === "string"
    ? detail
    : typeof message === "string"
      ? message
      : "No se pudo completar el cambio. Inténtalo de nuevo.";
}

export function parsePendingGroupCreate(
  value: string,
  organizationId: string
): PendingGroupCreate | null {
  try {
    const parsed = JSON.parse(value) as Partial<PendingGroupCreate>;
    if (
      parsed.version !== 1 ||
      parsed.organizationId !== organizationId ||
      typeof parsed.idempotencyKey !== "string" ||
      parsed.idempotencyKey.length === 0 ||
      typeof parsed.body !== "string"
    ) {
      return null;
    }
    const body = JSON.parse(parsed.body) as Partial<GroupCreatePayload>;
    if (
      body.organizationId !== organizationId ||
      typeof body.locationId !== "string" ||
      typeof body.programId !== "string" ||
      typeof body.name !== "string" ||
      !(body.capacity === null || typeof body.capacity === "number")
    ) {
      return null;
    }
    return {
      version: 1,
      organizationId,
      idempotencyKey: parsed.idempotencyKey,
      body: parsed.body,
    };
  } catch {
    return null;
  }
}

export function readPendingGroupCreate(
  storageKey: string,
  legacyStorageKey: string,
  organizationId: string
): PendingGroupCreateState | null {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored !== null) {
      const command = parsePendingGroupCreate(stored, organizationId);
      return command
        ? { kind: "replayable", organizationId, command }
        : { kind: "invalid", organizationId };
    }
    return window.sessionStorage.getItem(legacyStorageKey)
      ? { kind: "legacy", organizationId }
      : null;
  } catch {
    return { kind: "unavailable", organizationId };
  }
}

export const fieldClassName =
  "min-h-11 w-full border border-z-line bg-white px-3 py-2 text-sm text-z-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-z-brand-500";
export const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 bg-z-ink px-4 py-2 text-sm font-bold text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 border border-z-line bg-white px-4 py-2 text-sm font-semibold text-z-ink hover:bg-z-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-z-brand-500 disabled:cursor-not-allowed disabled:opacity-50";

export function statusLabel(status: string): string {
  if (status === "pending") return "Pendiente";
  if (status === "paused") return "En pausa";
  if (status === "ended") return "Finalizada";
  return "Activa";
}
