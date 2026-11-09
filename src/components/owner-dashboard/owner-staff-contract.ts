export type OwnerStaffStatus = "active" | "archived" | "all";

export type OwnerStaffProfile = Readonly<{
  id: string;
  givenName: string;
  familyName: string;
  preferredName: string | null;
  isActive: boolean;
  version: string;
}>;

export type OwnerStaffPage = Readonly<{
  items: OwnerStaffProfile[];
  nextCursor: string | null;
}>;

export type OwnerStaffMutationReceipt = Readonly<{
  staffProfileId: string;
  version: string;
  isActive: boolean;
  replayed: boolean;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSION = /^v1_[a-f0-9]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isStaffProfile(value: unknown): value is OwnerStaffProfile {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "givenName", "familyName", "preferredName", "isActive", "version"])) return false;
  return typeof value.id === "string" && UUID.test(value.id) &&
    typeof value.givenName === "string" && value.givenName.length > 0 &&
    typeof value.familyName === "string" && value.familyName.length > 0 &&
    (typeof value.preferredName === "string" || value.preferredName === null) &&
    typeof value.isActive === "boolean" &&
    typeof value.version === "string" && VERSION.test(value.version);
}

export function decodeOwnerStaffPage(payload: unknown): OwnerStaffPage | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) return null;
  const data = payload.data;
  if (!hasExactKeys(data, ["items", "nextCursor"]) || !Array.isArray(data.items) || data.items.length > 50) return null;
  if (data.nextCursor !== null &&
      (typeof data.nextCursor !== "string" || data.nextCursor.length === 0 || data.nextCursor.length > 128)) return null;
  if (!data.items.every(isStaffProfile)) return null;
  const seen = new Set<string>();
  for (const item of data.items as OwnerStaffProfile[]) {
    const normalizedId = item.id.toLowerCase();
    if (seen.has(normalizedId)) return null;
    seen.add(normalizedId);
  }
  return { items: data.items as OwnerStaffProfile[], nextCursor: data.nextCursor };
}

export function decodeOwnerStaffMutationReceipt(
  status: number,
  payload: unknown,
): OwnerStaffMutationReceipt | null {
  if ((status !== 200 && status !== 201) || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) return null;
  const data = payload.data;
  if (!hasExactKeys(data, ["receipt", "replayed"]) || typeof data.replayed !== "boolean" || !isRecord(data.receipt)) return null;
  const receipt = data.receipt;
  if (!hasExactKeys(receipt, ["staffProfileId", "version", "isActive"]) ||
      typeof receipt.staffProfileId !== "string" || !UUID.test(receipt.staffProfileId) ||
      typeof receipt.version !== "string" || !VERSION.test(receipt.version) ||
      typeof receipt.isActive !== "boolean") return null;
  return {
    staffProfileId: receipt.staffProfileId,
    version: receipt.version,
    isActive: receipt.isActive,
    replayed: data.replayed,
  };
}

export function ownerStaffErrorCode(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.code === "string") return payload.code;
  if (typeof payload.error === "string") return payload.error;
  return null;
}

export function ownerStaffErrorMessage(status: number, code: string | null): string {
  if (code === "IDEMPOTENCY_CONFLICT") return "El servidor detectó un conflicto con la clave de esta solicitud. Se conserva el comando original para revisión.";
  if (code === "STAFF_PROFILE_VERSION_CONFLICT" || status === 409) return "El perfil cambió desde que cargaste la lista. Actualiza los perfiles y revisa los datos antes de volver a guardar.";
  if (status === 401) return "Tu sesión ha caducado. Inicia sesión y vuelve a cargar los perfiles.";
  if (status === 403) return "Tu cuenta no tiene permiso para gestionar estos perfiles.";
  if (status === 404) return "El perfil o la academia ya no están disponibles. Actualiza la lista.";
  if (status === 400 || status === 415 || status === 422) return "No se aceptaron los datos del perfil. Revisa los nombres e inténtalo de nuevo.";
  if (status === 429) return "Hay demasiadas solicitudes seguidas. La operación queda guardada para un reintento manual.";
  return "No se pudo completar la solicitud. Se conserva para poder comprobar o repetir exactamente la misma operación.";
}

export function isDefinitiveOwnerStaffRejection(status: number, code: string | null): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429 && code !== "IDEMPOTENCY_CONFLICT";
}

export function normalizeOwnerStaffName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
