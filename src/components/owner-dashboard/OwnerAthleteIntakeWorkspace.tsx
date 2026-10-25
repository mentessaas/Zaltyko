"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { decodeOwnerUsage } from "@/components/owner-dashboard/owner-plan-usage-response";
import { usePendingCommandExitWarning } from "@/components/owner-dashboard/use-pending-command-exit-warning";

const PAGE_SIZE = 50;
export const OWNER_ATHLETE_INTAKE_PENDING_STORAGE_PREFIX = "zaltyko:owner-athlete-intake:v1:";
const COLLECTION_ENDPOINT = "/api/v1/owner/athlete-intake";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RELATIONSHIPS = ["parent", "legal_guardian", "foster_guardian", "other"] as const;

type Relationship = (typeof RELATIONSHIPS)[number];
type FamilySummary = Readonly<{
  familyId: string;
  relationship: Relationship;
  startsOn: string;
  incompleteFamily: boolean;
}>;
type IntakeAthlete = Readonly<{
  athleteId: string;
  givenName: string;
  familyName: string;
  familySummaries: FamilySummary[];
  incompleteFamily: boolean;
}>;
type EligibleGroup = Readonly<{
  groupId: string;
  groupName: string;
  locationId: string;
  locationName: string;
  capacity: number | null;
  occupancy: number;
  availablePlaces: number | null;
}>;
type IntakePage = Readonly<{
  items: IntakeAthlete[];
  eligibleGroups: EligibleGroup[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}>;
type CreateBody = Readonly<{
  organizationId: string;
  givenName: string;
  familyName: string;
  family:
    | { kind: "new"; relationship: Relationship; startsOn: string }
    | { kind: "existing"; familyId: string; relationship: Relationship; startsOn: string };
}>;
type AssignBody = Readonly<{ organizationId: string; groupId: string; startsOn: string }>;
type CreateIntent = Readonly<{
  version: 1;
  organizationId: string;
  kind: "create";
  endpoint: typeof COLLECTION_ENDPOINT;
  idempotencyKey: string;
  body: string;
}>;
type AssignIntent = Readonly<{
  version: 1;
  organizationId: string;
  kind: "assign";
  athleteId: string;
  endpoint: string;
  idempotencyKey: string;
  body: string;
}>;
type IntakeIntent = CreateIntent | AssignIntent;
type IntentRead =
  | { kind: "none" }
  | { kind: "pending"; intent: IntakeIntent }
  | { kind: "invalid" }
  | { kind: "unavailable" };
type UsageState = "loading" | "ready" | "unavailable";

const relationshipLabels: Record<Relationship, string> = {
  parent: "Madre, padre o progenitor",
  legal_guardian: "Tutor legal",
  foster_guardian: "Acogida o guarda",
  other: "Otra relación responsable",
};
const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:bg-slate-100";
const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-teal-800 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isRelationship(value: unknown): value is Relationship {
  return typeof value === "string" && RELATIONSHIPS.includes(value as Relationship);
}

function intentStorageKey(organizationId: string): string {
  return `${OWNER_ATHLETE_INTAKE_PENDING_STORAGE_PREFIX}${organizationId}`;
}

function assignEndpoint(athleteId: string): string {
  return `${COLLECTION_ENDPOINT}/${encodeURIComponent(athleteId)}/assign`;
}

function parseCreateBody(raw: string, organizationId: string): CreateBody | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !exactKeys(value, ["organizationId", "givenName", "familyName", "family"]) ||
      value.organizationId !== organizationId || typeof value.givenName !== "string" || !value.givenName.trim() ||
      value.givenName.length > 100 || typeof value.familyName !== "string" || !value.familyName.trim() ||
      value.familyName.length > 100 || !isRecord(value.family)) return null;
    const family = value.family;
    if (family.kind === "new" && exactKeys(family, ["kind", "relationship", "startsOn"]) &&
      isRelationship(family.relationship) && isCivilDate(family.startsOn)) {
      return { organizationId, givenName: value.givenName, familyName: value.familyName, family: {
        kind: "new", relationship: family.relationship, startsOn: family.startsOn,
      } };
    }
    if (family.kind === "existing" && exactKeys(family, ["kind", "familyId", "relationship", "startsOn"]) &&
      isUuid(family.familyId) && isRelationship(family.relationship) && isCivilDate(family.startsOn)) {
      return { organizationId, givenName: value.givenName, familyName: value.familyName, family: {
        kind: "existing", familyId: family.familyId, relationship: family.relationship, startsOn: family.startsOn,
      } };
    }
    return null;
  } catch {
    return null;
  }
}

function parseAssignBody(raw: string, organizationId: string): AssignBody | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !exactKeys(value, ["organizationId", "groupId", "startsOn"]) ||
      value.organizationId !== organizationId || !isUuid(value.groupId) || !isCivilDate(value.startsOn)) return null;
    return { organizationId, groupId: value.groupId, startsOn: value.startsOn };
  } catch {
    return null;
  }
}

function decodeIntent(raw: string | null, organizationId: string): IntentRead {
  if (raw === null) return { kind: "none" };
  if (raw.length > 4096) return { kind: "invalid" };
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || value.organizationId !== organizationId ||
      typeof value.idempotencyKey !== "string" || !UUID.test(value.idempotencyKey) ||
      typeof value.body !== "string") return { kind: "invalid" };
    if (value.kind === "create" && exactKeys(value, ["version", "organizationId", "kind", "endpoint", "idempotencyKey", "body"]) &&
      value.endpoint === COLLECTION_ENDPOINT && parseCreateBody(value.body, organizationId)) {
      return { kind: "pending", intent: value as CreateIntent };
    }
    if (value.kind === "assign" && exactKeys(value, ["version", "organizationId", "kind", "athleteId", "endpoint", "idempotencyKey", "body"]) &&
      isUuid(value.athleteId) && value.endpoint === assignEndpoint(value.athleteId) && parseAssignBody(value.body, organizationId)) {
      return { kind: "pending", intent: value as AssignIntent };
    }
    return { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

function readIntent(organizationId: string): IntentRead {
  try {
    return decodeIntent(window.sessionStorage.getItem(intentStorageKey(organizationId)), organizationId);
  } catch {
    return { kind: "unavailable" };
  }
}

function sameIntent(left: IntakeIntent, right: IntakeIntent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function persistIntent(intent: IntakeIntent): boolean {
  const current = readIntent(intent.organizationId);
  if (current.kind === "pending") return sameIntent(current.intent, intent);
  if (current.kind !== "none") return false;
  const encoded = JSON.stringify(intent);
  try {
    const key = intentStorageKey(intent.organizationId);
    window.sessionStorage.setItem(key, encoded);
    const saved = readIntent(intent.organizationId);
    return saved.kind === "pending" && sameIntent(saved.intent, intent);
  } catch {
    return false;
  }
}

function clearIntent(intent: IntakeIntent): boolean {
  const key = intentStorageKey(intent.organizationId);
  const current = readIntent(intent.organizationId);
  if (current.kind === "none") return true;
  if (current.kind !== "pending" || !sameIntent(current.intent, intent)) return false;
  try {
    window.sessionStorage.removeItem(key);
    return readIntent(intent.organizationId).kind === "none";
  } catch {
    return false;
  }
}

function parseCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseIntakePage(payload: unknown, requestedPage: number): IntakePage | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) return null;
  const data = payload.data;
  if (!exactKeys(data, ["items", "eligibleGroups", "total", "page", "pageSize", "hasMore"]) ||
      !Array.isArray(data.items) || !Array.isArray(data.eligibleGroups) || !parseCount(data.total) ||
      data.page !== requestedPage || data.pageSize !== PAGE_SIZE || typeof data.hasMore !== "boolean") return null;
  const items: IntakeAthlete[] = [];
  const athleteIds = new Set<string>();
  for (const item of data.items) {
    if (!isRecord(item) || !exactKeys(item, ["athleteId", "givenName", "familyName", "familySummaries", "incompleteFamily"]) ||
      !isUuid(item.athleteId) || athleteIds.has(item.athleteId) || typeof item.givenName !== "string" ||
      typeof item.familyName !== "string" || typeof item.incompleteFamily !== "boolean" || !Array.isArray(item.familySummaries)) return null;
    athleteIds.add(item.athleteId);
    const familySummaries: FamilySummary[] = [];
    const familyIds = new Set<string>();
    for (const summary of item.familySummaries) {
      if (!isRecord(summary) || !exactKeys(summary, ["familyId", "relationship", "startsOn", "incompleteFamily"]) ||
        !isUuid(summary.familyId) || familyIds.has(summary.familyId) || !isRelationship(summary.relationship) ||
        !isCivilDate(summary.startsOn) || typeof summary.incompleteFamily !== "boolean") return null;
      familyIds.add(summary.familyId);
      familySummaries.push({ familyId: summary.familyId, relationship: summary.relationship,
        startsOn: summary.startsOn, incompleteFamily: summary.incompleteFamily });
    }
    items.push({ athleteId: item.athleteId, givenName: item.givenName, familyName: item.familyName,
      familySummaries, incompleteFamily: item.incompleteFamily });
  }
  const groups: EligibleGroup[] = [];
  const groupIds = new Set<string>();
  for (const group of data.eligibleGroups) {
    if (!isRecord(group) || !exactKeys(group, ["groupId", "groupName", "locationId", "locationName", "capacity", "occupancy", "availablePlaces"]) ||
      !isUuid(group.groupId) || groupIds.has(group.groupId) || !isUuid(group.locationId) ||
      typeof group.groupName !== "string" || !group.groupName.trim() || typeof group.locationName !== "string" ||
      !group.locationName.trim() || !(group.capacity === null || (parseCount(group.capacity) && group.capacity > 0)) ||
      !parseCount(group.occupancy) || !(group.availablePlaces === null || parseCount(group.availablePlaces))) return null;
    groupIds.add(group.groupId);
    groups.push({ groupId: group.groupId, groupName: group.groupName, locationId: group.locationId,
      locationName: group.locationName, capacity: group.capacity, occupancy: group.occupancy,
      availablePlaces: group.availablePlaces });
  }
  if (data.hasMore !== ((requestedPage - 1) * PAGE_SIZE + items.length < data.total)) return null;
  return { items, eligibleGroups: groups, total: data.total, page: requestedPage, pageSize: PAGE_SIZE, hasMore: data.hasMore };
}

function readCreateReceipt(status: number, payload: unknown): { athleteId: string; incompleteFamily: boolean; replayed: boolean } | null {
  if ((status !== 200 && status !== 201) || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data) ||
      !exactKeys(payload.data, ["athleteId", "familyId", "incompleteFamily", "replayed"]) ||
      !isUuid(payload.data.athleteId) || !isUuid(payload.data.familyId) ||
      typeof payload.data.incompleteFamily !== "boolean" || typeof payload.data.replayed !== "boolean" ||
      payload.data.replayed !== (status === 200)) return null;
  return { athleteId: payload.data.athleteId, incompleteFamily: payload.data.incompleteFamily, replayed: payload.data.replayed };
}

function readAssignReceipt(status: number, payload: unknown, intent: AssignIntent): { startsOn: string; replayed: boolean } | null {
  const body = parseAssignBody(intent.body, intent.organizationId);
  if ((status !== 200 && status !== 201) || !body || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data) ||
      !exactKeys(payload.data, ["athleteId", "groupId", "membershipId", "startsOn", "replayed"]) ||
      payload.data.athleteId !== intent.athleteId || payload.data.groupId !== body.groupId ||
      !isUuid(payload.data.membershipId) || payload.data.startsOn !== body.startsOn ||
      typeof payload.data.replayed !== "boolean" || payload.data.replayed !== (status === 200)) return null;
  return { startsOn: body.startsOn, replayed: payload.data.replayed };
}

function errorCode(status: number, payload: unknown): string | null {
  if (status < 400 || !isRecord(payload) || payload.status !== status || typeof payload.type !== "string" ||
      !payload.type.startsWith("https://zaltyko.com/problems/")) return null;
  return payload.type.slice("https://zaltyko.com/problems/".length).toUpperCase().replaceAll("-", "_");
}

function errorMessage(code: string | null): string {
  switch (code) {
    case "CAPACITY_FULL": return "La academia ha alcanzado el límite de gimnastas. Revisa el plan o regulariza el excedente antes de iniciar otra alta.";
    case "PLAN_OVER_CAPACITY": return "La academia está en solo lectura por superar los límites del plan. Puedes consultar los datos, pero no iniciar una alta ni una asignación.";
    case "GROUP_CAPACITY_FULL": return "El grupo ya no tiene plazas disponibles. Actualiza la lista antes de elegir otro grupo.";
    case "DUPLICATE_OPEN_GROUP_MEMBERSHIP": return "La ficha ya pertenece a ese grupo; vuelve a consultar la lista.";
    case "INVALID_DATE_RANGE": return "La asignación inicial solo admite la fecha civil actual de la sede elegida.";
    case "FAMILY_MEMBERSHIP_DATE_CONFLICT": return "La ficha ya tiene un vínculo familiar que se solapa con esa fecha.";
    case "IDEMPOTENCY_CONFLICT": return "La clave guardada no coincide con un recibo recuperable. Se conserva bloqueada y no se enviarán cambios nuevos.";
    case "LOCATION_SCOPE_DENIED": return "Esta bandeja requiere acceso Owner/Admin a todas las sedes de la academia.";
    case "FORBIDDEN": return "Tu sesión ya no tiene permiso para esta operación. Conservamos el estado de esta pantalla.";
    case "NOT_FOUND": return "La ficha, familia, grupo o academia ya no está disponible. Vuelve a consultar antes de continuar.";
    default: return "No se pudo completar la operación. Comprueba la conexión y vuelve a consultar.";
  }
}

function relationshipLabel(value: Relationship): string {
  return relationshipLabels[value];
}

function createIntentFromForm(input: CreateBody): CreateIntent | null {
  try {
    return { version: 1, organizationId: input.organizationId, kind: "create", endpoint: COLLECTION_ENDPOINT,
      idempotencyKey: crypto.randomUUID(), body: JSON.stringify(input) };
  } catch {
    return null;
  }
}

function assignIntentFromForm(input: AssignBody, athleteId: string): AssignIntent | null {
  try {
    return { version: 1, organizationId: input.organizationId, kind: "assign", athleteId,
      endpoint: assignEndpoint(athleteId), idempotencyKey: crypto.randomUUID(), body: JSON.stringify(input) };
  } catch {
    return null;
  }
}

export function OwnerAthleteIntakeWorkspace({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<IntakePage | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState("");
  const [usageState, setUsageState] = useState<UsageState>("loading");
  const [readOnly, setReadOnly] = useState<boolean | null>(null);
  const [intent, setIntent] = useState<IntakeIntent | null>(null);
  const [intentBlocked, setIntentBlocked] = useState(false);
  const organizationRef = useRef(organizationId);
  const intentRef = useRef<IntakeIntent | null>(null);
  const commandFlowRef = useRef(false);
  const mountedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("parent");
  const [familyStartsOn, setFamilyStartsOn] = useState("");
  const [assignment, setAssignment] = useState<{ athleteId: string; groupId: string; startsOn: string } | null>(null);
  organizationRef.current = organizationId;
  if (intentRef.current !== intent) intentRef.current = intent;
  usePendingCommandExitWarning(intent !== null, intentRef);

  useEffect(() => {
    mountedRef.current = true;
    const restored = readIntent(organizationId);
    if (restored.kind === "pending") {
      setIntent(restored.intent);
      setIntentBlocked(false);
      setError("Se recuperó una operación pendiente. No se reenviará al abrir la página; usa el botón para repetir exactamente la misma solicitud.");
    } else if (restored.kind === "invalid" || restored.kind === "unavailable") {
      setIntent(null);
      setIntentBlocked(true);
      setError(restored.kind === "invalid"
        ? "Hay una operación guardada que no se puede validar para esta academia. No la borraremos ni enviaremos otra solicitud."
        : "No se puede leer el estado local de recuperación. No se enviarán altas ni asignaciones hasta poder comprobarlo.");
    } else {
      setIntent(null);
      setIntentBlocked(false);
    }
    return () => { mountedRef.current = false; };
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    setListState("loading");
    setListError("");
    setData(null);
    const query = new URLSearchParams({ organizationId, page: String(page), pageSize: String(PAGE_SIZE) });
    void fetch(`${COLLECTION_ENDPOINT}?${query.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, payload: await response.json().catch(() => null) }))
      .then(({ response, payload }) => {
        if (controller.signal.aborted) return;
        const parsed = response.status === 200 ? parseIntakePage(payload, page) : null;
        if (!parsed) {
          setListError(response.status === 200
            ? "La bandeja devolvió datos incompletos o con un formato distinto. No se muestran respuestas parciales."
            : errorMessage(errorCode(response.status, payload)));
          setListState("error");
          return;
        }
        setData(parsed);
        setListState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setListError("No se pudo conectar con la bandeja. Comprueba la conexión y vuelve a cargar.");
          setListState("error");
        }
      });
    return () => controller.abort();
  }, [organizationId, page, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setUsageState("loading");
    setReadOnly(null);
    const query = new URLSearchParams({ organizationId });
    void fetch(`/api/v1/owner/saas/usage?${query.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, payload: await response.json().catch(() => null) }))
      .then(({ response, payload }) => {
        if (controller.signal.aborted) return;
        const usage = response.status === 200 ? decodeOwnerUsage(payload) : null;
        if (!usage) {
          setUsageState("unavailable");
          setReadOnly(null);
          return;
        }
        setReadOnly(usage.readOnly);
        setUsageState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setUsageState("unavailable");
          setReadOnly(null);
        }
      });
    return () => controller.abort();
  }, [organizationId, refresh]);

  const canStartCommand = usageState === "ready" && readOnly === false && intent === null && !intentBlocked && !busy;

  async function executeIntent(command: IntakeIntent) {
    if (!commandFlowRef.current || !mountedRef.current || command.organizationId !== organizationRef.current) return;
    const stored = readIntent(organizationId);
    if (stored.kind !== "pending" || !sameIntent(stored.intent, command)) {
      setIntentBlocked(true);
      setError(stored.kind === "unavailable"
        ? "No se pudo comprobar la solicitud guardada. No se enviará ningún cambio."
        : "La solicitud guardada no coincide exactamente. Se conserva para revisión y no se enviará.");
      return;
    }
    setError("");
    setNotice("");
    try {
      const response = await fetch(command.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": command.idempotencyKey },
        body: command.body,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!mountedRef.current) return;
      if (command.kind === "create") {
        const receipt = readCreateReceipt(response.status, payload);
        if (receipt) {
          if (!clearIntent(command)) {
            setIntent(command);
            setIntentBlocked(false);
            setError("El servidor confirmó la operación, pero no se pudo limpiar su marcador local. Conservamos la misma clave para comprobarla otra vez.");
            return;
          }
          setIntent(null);
          setIntentBlocked(false);
          setGivenName("");
          setFamilyName("");
          setFamilyStartsOn("");
          setNotice(receipt.incompleteFamily
            ? `Ficha creada${receipt.replayed ? " (el servidor confirmó el alta anterior)" : ""}. La familia queda incompleta: aún falta asociar un tutor/pagador. No se creó una cuenta ni se enviaron mensajes.`
            : `Ficha creada${receipt.replayed ? " (el servidor confirmó el alta anterior)" : ""}.`);
          setRefresh((value) => value + 1);
          return;
        }
      } else {
        const receipt = readAssignReceipt(response.status, payload, command);
        if (receipt) {
          if (!clearIntent(command)) {
            setIntent(command);
            setIntentBlocked(false);
            setError("El servidor confirmó la operación, pero no se pudo limpiar su marcador local. Conservamos la misma clave para comprobarla otra vez.");
            return;
          }
          setIntent(null);
          setIntentBlocked(false);
          setAssignment(null);
          setNotice(`Gimnasta asignada al grupo${receipt.replayed ? " (el servidor confirmó la asignación anterior)" : ""}.`);
          setRefresh((value) => value + 1);
          return;
        }
      }

      const code = errorCode(response.status, payload);
      if (code === "IDEMPOTENCY_CONFLICT") {
        setIntent(command);
        setIntentBlocked(true);
        setError(errorMessage(code));
        return;
      }
      const definitive = response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status) && code !== null;
      if (definitive) {
        if (!clearIntent(command)) {
          setIntent(command);
          setIntentBlocked(false);
          setError("La solicitud fue rechazada, pero no se pudo limpiar el marcador. Conservamos la misma operación y no prepararemos otra.");
          return;
        }
        setIntent(null);
        setIntentBlocked(false);
        setError(errorMessage(code));
        setRefresh((value) => value + 1);
        return;
      }
      setIntent(command);
      setIntentBlocked(false);
      setError("No se sabe si la solicitud se aplicó. Conservamos exactamente el cuerpo y la clave; usa solo el botón de reintento.");
    } catch {
      if (mountedRef.current) {
        setIntent(command);
        setIntentBlocked(false);
        setError("No se sabe si la solicitud se aplicó. Conservamos exactamente el cuerpo y la clave; usa solo el botón de reintento.");
      }
    }
  }

  function claimNewCommand(): boolean {
    if (commandFlowRef.current || !canStartCommand || !mountedRef.current) return false;
    const current = readIntent(organizationId);
    if (current.kind !== "none") {
      if (current.kind === "pending") {
        setIntent(current.intent);
        setIntentBlocked(false);
        setError("Se encontró una operación pendiente. Revisa y reintenta solo esa solicitud antes de iniciar otra.");
      } else {
        setIntentBlocked(true);
        setError(current.kind === "invalid"
          ? "Hay una operación guardada que no se puede validar para esta academia. No la borraremos ni enviaremos otra solicitud."
          : "No se puede comprobar el estado local de recuperación. No se iniciará una solicitud nueva.");
      }
      return false;
    }
    commandFlowRef.current = true;
    setBusy(true);
    return true;
  }

  function releaseCommandFlow() {
    commandFlowRef.current = false;
    if (mountedRef.current) setBusy(false);
  }

  async function prepareIntent(command: IntakeIntent) {
    if (!commandFlowRef.current) return;
    try {
      if (!mountedRef.current || command.organizationId !== organizationRef.current) {
        setError("La academia cambió antes de enviar la operación. No se ha guardado ni enviado.");
        return;
      }
      setError("");
      setNotice("");
      let freshUsage: ReturnType<typeof decodeOwnerUsage> = null;
      const query = new URLSearchParams({ organizationId });
      try {
        const response = await fetch(`/api/v1/owner/saas/usage?${query.toString()}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!mountedRef.current || command.organizationId !== organizationRef.current) {
          setError("La academia cambió mientras se comprobaban los límites. No se guardó ni envió la operación.");
          return;
        }
        freshUsage = response.status === 200 ? decodeOwnerUsage(payload) : null;
      } catch {
        freshUsage = null;
      }
      if (!mountedRef.current) return;
      if (command.organizationId !== organizationRef.current) {
        setError("La academia cambió mientras se comprobaban los límites. No se guardó ni envió la operación.");
        return;
      }
      if (!freshUsage) {
        setUsageState("unavailable");
        setReadOnly(null);
        setError("No se pudo revalidar el uso del plan. No se ha guardado ni enviado la nueva operación.");
        return;
      }
      setUsageState("ready");
      setReadOnly(freshUsage.readOnly);
      if (freshUsage.readOnly) {
        setError("La academia ha pasado a solo lectura. No se ha guardado ni enviado la nueva operación.");
        return;
      }
      if (!persistIntent(command)) {
        const current = readIntent(organizationId);
        if (current.kind === "pending") setIntent(current.intent);
        else setIntentBlocked(true);
        setError("No se pudo guardar y verificar la solicitud exacta en esta pestaña. No se ha enviado ningún cambio.");
        return;
      }
      setIntent(command);
      setIntentBlocked(false);
      await executeIntent(command);
    } finally {
      releaseCommandFlow();
    }
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStartCommand || commandFlowRef.current) return;
    const body: CreateBody = {
      organizationId,
      givenName: givenName.trim().normalize("NFC").replace(/\s+/gu, " "),
      familyName: familyName.trim().normalize("NFC").replace(/\s+/gu, " "),
      family: { kind: "new", relationship, startsOn: familyStartsOn },
    };
    if (!body.givenName || !body.familyName || !isCivilDate(body.family.startsOn)) {
      setError("Completa nombre, apellidos y fecha civil del vínculo familiar.");
      return;
    }
    if (!claimNewCommand()) return;
    const command = createIntentFromForm(body);
    if (!command) {
      releaseCommandFlow();
      setError("No se pudo generar una clave segura. No se ha enviado el alta.");
      return;
    }
    void prepareIntent(command);
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canStartCommand || commandFlowRef.current || !assignment) return;
    const body: AssignBody = { organizationId, groupId: assignment.groupId, startsOn: assignment.startsOn };
    if (!isUuid(body.groupId) || !isCivilDate(body.startsOn)) {
      setError("Elige un grupo activo y escribe la fecha civil de inicio.");
      return;
    }
    if (!data?.eligibleGroups.some((group) => group.groupId === body.groupId)) {
      setError("El grupo ya no está disponible en la lista del servidor. Actualiza antes de continuar.");
      return;
    }
    if (!claimNewCommand()) return;
    const command = assignIntentFromForm(body, assignment.athleteId);
    if (!command) {
      releaseCommandFlow();
      setError("No se pudo generar una clave segura. No se ha enviado la asignación.");
      return;
    }
    void prepareIntent(command);
  }

  function retryIntent() {
    if (!intent || intentBlocked || busy || commandFlowRef.current) return;
    commandFlowRef.current = true;
    setBusy(true);
    void executeIntent(intent).finally(releaseCommandFlow);
  }

  function reload() {
    setError("");
    setNotice("");
    setRefresh((value) => value + 1);
  }

  const newWritesDisabled = !canStartCommand;
  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-6 text-slate-950 sm:py-10">
      <div className="mx-auto grid max-w-5xl gap-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-900">{organizationName}</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Gimnastas</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
            Bandeja organizativa de Owner/Admin para fichas activas que todavía no tienen asignación operativa. Las sedes y grupos se cargan desde la academia; no se aceptan identificadores escritos a mano.
          </p>
        </header>

        {usageState === "ready" && readOnly ? (
          <aside role="status" className="border border-amber-600 bg-amber-50 p-4 text-sm text-slate-950">
            <strong>Academia en solo lectura.</strong> Se conservan los datos. Puedes consultar la bandeja y resolver una operación exacta que ya estuviera pendiente, pero no iniciar altas ni asignaciones. <Link className="font-bold underline" href={`/owner/subscription?organizationId=${encodeURIComponent(organizationId)}#regularizar`}>Archivar excedente o contratar capacidad suficiente</Link>.
          </aside>
        ) : null}
        {usageState === "loading" ? <p role="status" className="text-sm text-slate-700">Comprobando límites del plan antes de habilitar cambios…</p> : null}
        {usageState === "unavailable" ? (
          <div className="border border-red-300 bg-white p-4 text-sm text-red-950">
            <p role="alert">No se pudo verificar el estado del plan. Por seguridad, las altas y asignaciones nuevas permanecen deshabilitadas.</p>
            <button type="button" className={`${secondaryButtonClassName} mt-3`} onClick={reload}>Volver a comprobar</button>
          </div>
        ) : null}

        {intentBlocked ? (
          <div className="border border-red-400 bg-red-50 p-4">
            <h2 className="font-bold">Recuperación bloqueada</h2>
            <p role="alert" className="mt-2 text-sm">{error || "No se pudo validar la operación guardada. No se enviarán cambios nuevos ni se borrará el marcador."}</p>
          </div>
        ) : intent ? (
          <section className="border border-amber-500 bg-amber-50 p-4" aria-label="Operación pendiente">
            <h2 className="font-bold">Hay una operación pendiente de confirmar</h2>
            <p className="mt-2 text-sm">{intent.kind === "create" ? "Alta de gimnasta y vínculo familiar" : "Asignación de una ficha a un grupo"}. No se reenviará automáticamente y mantiene su academia, contenido y clave originales.</p>
            <button type="button" className={`${secondaryButtonClassName} mt-3`} onClick={retryIntent} disabled={busy}>
              {busy ? "Comprobando…" : "Reintentar exactamente la misma operación"}
            </button>
          </section>
        ) : null}

        {error && !intentBlocked && !intent ? <p role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-950">{error}</p> : null}
        {notice ? <p role="status" className="border border-teal-300 bg-teal-50 p-3 text-sm">{notice}</p> : null}

        <section aria-labelledby="new-athlete-heading" className="border border-slate-300 bg-white p-5 sm:p-6">
          <h2 id="new-athlete-heading" className="font-display text-xl font-bold">Alta de gimnasta</h2>
          <p className="mt-2 text-sm text-slate-700">Esta versión crea una familia nueva y el vínculo con la gimnasta. No crea tutor, pagador, cuenta ni envía mensajes; la familia puede quedar incompleta hasta que se complete esa asociación.</p>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submitCreate}>
            <label className="text-sm font-semibold">Nombre
              <input className={`${fieldClassName} mt-2`} autoComplete="given-name" maxLength={100} value={givenName} onChange={(event) => setGivenName(event.target.value)} disabled={newWritesDisabled} required />
            </label>
            <label className="text-sm font-semibold">Apellidos
              <input className={`${fieldClassName} mt-2`} autoComplete="family-name" maxLength={100} value={familyName} onChange={(event) => setFamilyName(event.target.value)} disabled={newWritesDisabled} required />
            </label>
            <label className="text-sm font-semibold">Relación familiar inicial
              <select className={`${fieldClassName} mt-2`} value={relationship} onChange={(event) => setRelationship(event.target.value as Relationship)} disabled={newWritesDisabled}>
                {RELATIONSHIPS.map((option) => <option key={option} value={option}>{relationshipLabel(option)}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">Fecha efectiva del vínculo familiar
              <input className={`${fieldClassName} mt-2`} type="date" value={familyStartsOn} onChange={(event) => setFamilyStartsOn(event.target.value)} disabled={newWritesDisabled} required />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={primaryButtonClassName} disabled={newWritesDisabled}>Crear ficha y familia</button>
              {newWritesDisabled ? <p className="mt-2 text-xs text-slate-600">Las nuevas escrituras se habilitan cuando el servidor confirma acceso, límites y ausencia de otra operación pendiente.</p> : null}
            </div>
          </form>
        </section>

        <section aria-labelledby="unassigned-heading" className="border border-slate-300 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="unassigned-heading" className="font-display text-xl font-bold">Fichas sin asignación operativa</h2>
              <p className="mt-1 text-sm text-slate-600">{data ? `${data.total} fichas en total · página ${data.page}` : "La lista se obtiene del servidor."}</p>
            </div>
            <button type="button" className={secondaryButtonClassName} onClick={reload} disabled={listState === "loading"}>Actualizar lista</button>
          </div>
          {listState === "loading" ? <p role="status" className="mt-4">Cargando fichas y grupos elegibles…</p> : null}
          {listState === "error" ? (
            <div className="mt-4 border border-red-300 bg-red-50 p-3">
              <p role="alert" className="text-sm text-red-950">{listError || "No se pudo cargar la bandeja. No se muestran datos parciales."}</p>
              <button type="button" className={`${secondaryButtonClassName} mt-2`} onClick={reload}>Volver a cargar</button>
            </div>
          ) : null}
          {listState === "ready" && data && data.items.length === 0 ? (
            <p role="status" className="mt-4 border border-slate-300 bg-slate-50 p-4 text-sm">No hay fichas activas sin asignación operativa en esta página de la academia.</p>
          ) : null}
          {listState === "ready" && data && data.items.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-200">
              {data.items.map((athlete) => (
                <li key={athlete.athleteId} className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{athlete.givenName} {athlete.familyName}</h3>
                      {athlete.incompleteFamily ? (
                        <p className="mt-1 text-sm text-amber-900">Familia incompleta: falta asociar un tutor/pagador.</p>
                      ) : <p className="mt-1 text-sm text-slate-700">Familia completa.</p>}
                      {athlete.familySummaries.map((family) => (
                        <p key={family.familyId} className="mt-1 text-xs text-slate-600">
                          {relationshipLabel(family.relationship)} · fecha efectiva {family.startsOn}{family.incompleteFamily ? " · faltan datos de tutor/pagador" : ""}
                        </p>
                      ))}
                    </div>
                    {assignment?.athleteId === athlete.athleteId ? (
                      <button type="button" className={secondaryButtonClassName} onClick={() => setAssignment(null)} disabled={busy || intent !== null}>Cerrar asignación</button>
                    ) : (
                      <button type="button" className={secondaryButtonClassName} onClick={() => { setError(""); setAssignment({ athleteId: athlete.athleteId, groupId: "", startsOn: "" }); }} disabled={newWritesDisabled || intent !== null || data.eligibleGroups.length === 0}>
                        {data.eligibleGroups.length > 0 ? "Asignar a un grupo" : "Sin grupos disponibles"}
                      </button>
                    )}
                  </div>
                  {data.eligibleGroups.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-600">No hay grupos activos con plazas disponibles en las sedes autorizadas. La ficha permanece sin asignación.</p>
                  ) : null}
                  {assignment?.athleteId === athlete.athleteId ? (
                    <form className="mt-4 grid gap-4 border border-slate-300 bg-slate-50 p-4 sm:grid-cols-2" onSubmit={submitAssignment}>
                      <label className="text-sm font-semibold">Grupo y sede
                        <select className={`${fieldClassName} mt-2`} value={assignment.groupId} onChange={(event) => setAssignment((current) => current ? { ...current, groupId: event.target.value } : current)} disabled={newWritesDisabled} required>
                          <option value="">Selecciona un grupo disponible</option>
                          {data.eligibleGroups.map((group) => (
                            <option key={group.groupId} value={group.groupId}>
                              {group.groupName} · {group.locationName} · {group.occupancy}/{group.capacity ?? "sin límite"}
                            </option>
                          ))}
                        </select>
                        {data.eligibleGroups.length === 0 ? <span className="mt-2 block text-xs text-slate-600">No hay grupos activos con plazas disponibles en las sedes autorizadas.</span> : null}
                      </label>
                      <label className="text-sm font-semibold">Fecha civil de inicio en la sede
                        <input className={`${fieldClassName} mt-2`} type="date" value={assignment.startsOn} onChange={(event) => setAssignment((current) => current ? { ...current, startsOn: event.target.value } : current)} disabled={newWritesDisabled} required />
                        <span className="mt-2 block text-xs font-normal text-slate-600">La primera asignación solo admite la fecha de hoy según la sede; el servidor la comprobará.</span>
                      </label>
                      <div className="sm:col-span-2">
                        <button type="submit" className={primaryButtonClassName} disabled={newWritesDisabled || !data.eligibleGroups.some((group) => group.groupId === assignment.groupId)}>Asignar gimnasta</button>
                      </div>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {data && (data.page > 1 || data.hasMore) ? (
            <nav aria-label="Paginación de gimnastas" className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <button type="button" className={secondaryButtonClassName} onClick={() => { setAssignment(null); setPage((value) => Math.max(1, value - 1)); }} disabled={data.page <= 1 || listState === "loading" || intent !== null}>Anterior</button>
              <span className="text-sm text-slate-700">Página {data.page}</span>
              <button type="button" className={secondaryButtonClassName} onClick={() => { setAssignment(null); setPage((value) => value + 1); }} disabled={!data.hasMore || listState === "loading" || intent !== null}>Siguiente</button>
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
