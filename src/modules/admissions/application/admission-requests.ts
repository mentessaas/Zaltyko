import { randomBytes, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { createOwnerAthleteIntakeInTx } from "@/modules/athletes/application/owner-athlete-intake";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import { lockOrganizationForSaasMutation } from "@/modules/saas-billing/application/entitlement-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";
import { joinWaitlistInTx } from "@/modules/waitlists/application/waitlist-service";

import {
  ANONYMIZED_ATHLETE_NAME,
  ANONYMIZED_CONTACT_NAME,
  TRIAL_REQUEST_PRIVACY_VERSION,
  admissionLinkTokenSchema,
  anonymizedContactEmail,
  canTransitionTrialRequest,
  closedTrialRequestStatuses,
  isOpenTrialRequest,
  openTrialRequestStatuses,
  trialRequestIntakeKey,
  trialRequestWaitlistKey,
  type OwnerTrialRequestConvertCommand,
  type PublicTrialRequest,
  type TrialRequestStatus,
} from "../domain/trial-request";
import {
  assertAdmissionStorageAvailable,
  isAdmissionStorageAvailable,
} from "./admission-storage";

/** Estados de academia que pueden recibir solicitudes públicas. */
const receivingOrganizationStatuses = ["trial", "active"] as const;
const managingRoles = new Set(["owner", "admin"]);

/**
 * Misma respuesta para un enlace desconocido, desactivado, revocado o de una
 * academia que ya no recibe: no confirma qué enlaces existen.
 */
export const LINK_NOT_RECEIVING_MESSAGE = "Este enlace no admite solicitudes.";
const notReceiving = () => new OperationalError("NOT_FOUND", LINK_NOT_RECEIVING_MESSAGE, 404);
const requestNotFound = () => new OperationalError("NOT_FOUND", "Solicitud no encontrada", 404);
const staleRequest = () =>
  new OperationalError("VERSION_CONFLICT", "La solicitud ha cambiado. Vuelve a cargar la bandeja.", 409);
const managersOnly = (action: string) =>
  new OperationalError(
    "FORBIDDEN",
    `${action} requiere la dirección o la administración con acceso a todas las sedes`,
    403
  );

const guid = z.guid();
const statusList = (statuses: readonly string[]) =>
  sql.join(statuses.map((status) => sql`${status}`), sql`, `);

/* ------------------------------------------------------------------------ */
/* Público                                                                   */
/* ------------------------------------------------------------------------ */

type ResolvedLink = {
  link_id: string;
  organization_id: string;
  organization_name: string;
  location_id: string | null;
};

/**
 * Resuelve un enlace activo: existe, está habilitado, no está revocado y su
 * academia recibe solicitudes. Cualquier otro caso devuelve `null`.
 */
async function resolveActiveLink(
  client: TransactionClient | typeof db,
  rawToken: string,
  lock: boolean
): Promise<ResolvedLink | null> {
  const token = admissionLinkTokenSchema.safeParse(rawToken);
  if (!token.success) return null;
  const result = await client.execute(sql`
    select k.id::text as link_id, o.id::text as organization_id, o.name as organization_name,
           k.location_id::text as location_id
    from zaltyko.admission_links k
    join zaltyko.organizations o on o.id = k.organization_id
    where k.token = ${token.data}
      and k.enabled = true
      and k.revoked_at is null
      and o.status::text in (${statusList(receivingOrganizationStatuses)})
    limit 1
    ${lock ? sql`for share of k, o` : sql``}
  `);
  return (result.rows[0] as ResolvedLink | undefined) ?? null;
}

async function activeLocationsFor(
  client: TransactionClient | typeof db,
  link: ResolvedLink
): Promise<Array<{ id: string; name: string }>> {
  const result = await client.execute(sql`
    select l.id::text as id, l.name
    from zaltyko.locations l
    where l.organization_id = ${link.organization_id}::uuid
      and l.is_active = true
      ${link.location_id ? sql`and l.id = ${link.location_id}::uuid` : sql``}
    order by l.name asc, l.id asc
    limit 50
  `);
  return (result.rows as Array<{ id: string; name: string }>).map((row) => ({ id: row.id, name: row.name }));
}

export type PublicAdmissionTarget = {
  organizationName: string;
  locations: Array<{ id: string; name: string }>;
};

/**
 * Lo único que la página pública muestra: el nombre de la academia y las
 * sedes activas del enlace. `null` si el enlace no admite solicitudes o si el
 * almacenamiento no está instalado.
 */
export async function getPublicAdmissionTarget(token: string): Promise<PublicAdmissionTarget | null> {
  if (!admissionLinkTokenSchema.safeParse(token).success) return null;
  if (!(await isAdmissionStorageAvailable(db))) return null;
  const link = await resolveActiveLink(db, token, false);
  if (!link) return null;
  const locations = await activeLocationsFor(db, link);
  if (locations.length === 0) return null;
  return { organizationName: link.organization_name, locations };
}

/** Academia del enlace, para el límite de peticiones por academia. */
export async function resolveAdmissionLinkOrganization(token: string): Promise<string | null> {
  await assertAdmissionStorageAvailable(db);
  return (await resolveActiveLink(db, token, false))?.organization_id ?? null;
}

export type PublicTrialRequestResult = { requestId: string; replayed: boolean };

type StoredSubmission = {
  id: string;
  location_id: string;
  link_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  athlete_given_name: string;
  athlete_birth_year: number | null;
  message: string | null;
};

function sameSubmission(stored: StoredSubmission, input: PublicTrialRequest, locationId: string, linkId: string): boolean {
  return (
    stored.location_id === locationId &&
    stored.link_id === linkId &&
    stored.contact_name === input.contactName &&
    stored.contact_email === input.contactEmail &&
    (stored.contact_phone ?? null) === input.contactPhone &&
    stored.athlete_given_name === input.athleteGivenName &&
    (stored.athlete_birth_year === null ? null : Number(stored.athlete_birth_year)) === input.athleteBirthYear &&
    (stored.message ?? null) === input.message
  );
}

/**
 * Guarda la solicitud. El `submissionId` lo genera el navegador: un reenvío
 * idéntico devuelve la misma solicitud y uno distinto con la misma clave es un
 * conflicto. No crea gimnastas, familias ni contactos.
 */
export async function submitPublicTrialRequest(
  input: PublicTrialRequest,
  now: Date = new Date()
): Promise<PublicTrialRequestResult> {
  return db.transaction(async (tx) => {
    await assertAdmissionStorageAvailable(tx);
    const link = await resolveActiveLink(tx, input.linkToken, true);
    if (!link) throw notReceiving();

    const activeLocationIds = (await activeLocationsFor(tx, link)).map((location) => location.id);
    if (activeLocationIds.length === 0) throw notReceiving();

    let locationId: string;
    if (input.locationId) {
      if (!activeLocationIds.includes(input.locationId)) {
        throw new OperationalError("INVALID_RELATION", "Elige una sede de la academia.", 422);
      }
      locationId = input.locationId;
    } else if (activeLocationIds.length === 1) {
      locationId = activeLocationIds[0]!;
    } else {
      throw new OperationalError("INVALID_RELATION", "Elige una sede de la academia.", 422);
    }

    const inserted = await tx.execute(sql`
      insert into zaltyko.admission_requests (
        organization_id, location_id, link_id, submission_id,
        contact_name, contact_email, contact_phone,
        athlete_given_name, athlete_birth_year, message,
        privacy_consent_version, privacy_consent_at
      ) values (
        ${link.organization_id}::uuid, ${locationId}::uuid, ${link.link_id}::uuid, ${input.submissionId}::uuid,
        ${input.contactName}, ${input.contactEmail}, ${input.contactPhone},
        ${input.athleteGivenName}, ${input.athleteBirthYear}, ${input.message},
        ${TRIAL_REQUEST_PRIVACY_VERSION}, ${now.toISOString()}::timestamptz
      )
      on conflict (organization_id, submission_id) do nothing
      returning id::text as id
    `);
    const createdId = (inserted.rows[0] as { id?: string } | undefined)?.id;
    if (createdId) {
      // Punto de enganche del aviso a la academia (evento lógico
      // `admission_request.received`). DESACTIVADO: esta PR no envía correos.
      // Para activarlo hace falta autorización de envíos y un outbox sin datos
      // personales (solo organizationId, locationId y requestId).
      return { requestId: createdId, replayed: false };
    }

    const existing = await tx.execute(sql`
      select id::text as id, location_id::text as location_id, link_id::text as link_id,
             contact_name, contact_email, contact_phone, athlete_given_name, athlete_birth_year, message
      from zaltyko.admission_requests
      where organization_id = ${link.organization_id}::uuid
        and submission_id = ${input.submissionId}::uuid
      limit 1
    `);
    const stored = existing.rows[0] as StoredSubmission | undefined;
    if (!stored || !sameSubmission(stored, input, locationId, link.link_id)) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "Esta solicitud ya se envió con otros datos. Recarga la página para enviar una nueva.",
        409
      );
    }
    return { requestId: stored.id, replayed: true };
  });
}

/* ------------------------------------------------------------------------ */
/* Bandeja /owner                                                            */
/* ------------------------------------------------------------------------ */

export type OwnerTrialRequestItem = {
  id: string;
  locationId: string;
  locationName: string;
  status: TrialRequestStatus;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  athleteGivenName: string;
  athleteBirthYear: number | null;
  message: string | null;
  createdAt: string;
  handledAt: string | null;
  anonymized: boolean;
  revision: number;
  convertedAthleteId: string | null;
  waitlistEntryId: string | null;
};

export type OwnerAdmissionLink = {
  id: string;
  locationId: string | null;
  token: string;
  enabled: boolean;
  createdAt: string;
};

export type OwnerTrialRequestPage = {
  available: boolean;
  view: "open" | "closed";
  items: OwnerTrialRequestItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  counts: { new: number; contacted: number; closed: number };
  locations: Array<{ id: string; name: string }>;
  links: OwnerAdmissionLink[];
  canManage: boolean;
};

/** Dirección o administración con todas las sedes: enlaces, conversión y supresión. */
export function canManageTrialRequests(scope: Pick<OwnerScope, "member">): boolean {
  return managingRoles.has(scope.member.role) && scope.member.locationScopeMode === "all";
}

/** Sedes visibles para esta persona; con `locationId`, solo esa si está en su alcance. */
export function trialRequestLocationIds(
  scope: Pick<OwnerScope, "locations">,
  locationId?: string | null
): string[] {
  const allowed = scope.locations.map((location) => location.id.toLowerCase());
  if (!locationId) return allowed;
  const requested = locationId.toLowerCase();
  if (!allowed.includes(requested)) {
    throw new OperationalError("LOCATION_SCOPE_DENIED", "Sede fuera de alcance", 403);
  }
  return [requested];
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export async function listOwnerTrialRequests(input: {
  scope: OwnerScope;
  locationId?: string | null;
  view: "open" | "closed";
  page: number;
  pageSize: number;
}): Promise<OwnerTrialRequestPage> {
  const { scope } = input;
  const organizationId = scope.organization.id;
  const locationIds = trialRequestLocationIds(scope, input.locationId);
  const canManage = canManageTrialRequests(scope);
  const scopedLocations = scope.locations
    .filter((location) => locationIds.includes(location.id.toLowerCase()))
    .map((location) => ({ id: location.id, name: location.name }));
  const empty: OwnerTrialRequestPage = {
    available: false,
    view: input.view,
    items: [],
    total: 0,
    page: input.page,
    pageSize: input.pageSize,
    hasMore: false,
    counts: { new: 0, contacted: 0, closed: 0 },
    locations: scopedLocations,
    links: [],
    canManage,
  };
  if (!(await isAdmissionStorageAvailable(db))) return empty;
  if (locationIds.length === 0) return { ...empty, available: true };

  const statuses: readonly TrialRequestStatus[] =
    input.view === "open" ? openTrialRequestStatuses : closedTrialRequestStatuses;
  const offset = (input.page - 1) * input.pageSize;

  const [itemsResult, countsResult, linksResult] = await Promise.all([
    db.execute(sql`
      select r.id::text as id, r.location_id::text as location_id, l.name as location_name,
             r.status, r.contact_name, r.contact_email, r.contact_phone,
             r.athlete_given_name, r.athlete_birth_year, r.message,
             r.created_at, r.handled_at, r.anonymized_at, r.revision,
             r.converted_athlete_id::text as converted_athlete_id,
             r.waitlist_entry_id::text as waitlist_entry_id,
             count(*) over ()::int as total
      from zaltyko.admission_requests r
      join zaltyko.locations l
        on l.organization_id = r.organization_id
       and l.id = r.location_id
      where r.organization_id = ${organizationId}::uuid
        and r.location_id = any(${sqlUuidArray(locationIds)})
        and r.status in (${statusList(statuses)})
      order by case when r.status = 'new' then 0 else 1 end, r.created_at desc, r.id desc
      limit ${input.pageSize} offset ${offset}
    `),
    db.execute(sql`
      select
        count(*) filter (where r.status = 'new')::int as new,
        count(*) filter (where r.status = 'contacted')::int as contacted,
        count(*) filter (where r.status in ('converted', 'waitlisted', 'declined'))::int as closed
      from zaltyko.admission_requests r
      where r.organization_id = ${organizationId}::uuid
        and r.location_id = any(${sqlUuidArray(locationIds)})
    `),
    // Enlaces vigentes (no revocados). El general (sin sede) lo ve quien
    // gestiona todas las sedes; el de una sede, quien tiene esa sede.
    db.execute(sql`
      select k.id::text as id, k.location_id::text as location_id, k.token, k.enabled, k.created_at
      from zaltyko.admission_links k
      where k.organization_id = ${organizationId}::uuid
        and k.revoked_at is null
        and (
          k.location_id = any(${sqlUuidArray(locationIds)})
          ${scope.member.locationScopeMode === "all" && !input.locationId ? sql`or k.location_id is null` : sql``}
        )
      order by k.location_id nulls first, k.created_at desc
      limit 60
    `),
  ]);

  type Row = {
    id: string;
    location_id: string;
    location_name: string;
    status: TrialRequestStatus;
    contact_name: string;
    contact_email: string;
    contact_phone: string | null;
    athlete_given_name: string;
    athlete_birth_year: number | string | null;
    message: string | null;
    created_at: unknown;
    handled_at: unknown;
    anonymized_at: unknown;
    revision: number | string;
    converted_athlete_id: string | null;
    waitlist_entry_id: string | null;
    total: number | string;
  };
  const rows = itemsResult.rows as Row[];
  const counts = (countsResult.rows[0] ?? {}) as { new?: number | string; contacted?: number | string; closed?: number | string };
  const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
  type LinkRow = { id: string; location_id: string | null; token: string; enabled: boolean; created_at: unknown };

  return {
    ...empty,
    available: true,
    items: rows.map((row) => ({
      id: row.id,
      locationId: row.location_id,
      locationName: row.location_name,
      status: row.status,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      athleteGivenName: row.athlete_given_name,
      athleteBirthYear: row.athlete_birth_year === null ? null : Number(row.athlete_birth_year),
      message: row.message,
      createdAt: toIso(row.created_at)!,
      handledAt: toIso(row.handled_at),
      anonymized: row.anonymized_at !== null && row.anonymized_at !== undefined,
      revision: Number(row.revision),
      convertedAthleteId: row.converted_athlete_id,
      waitlistEntryId: row.waitlist_entry_id,
    })),
    total,
    hasMore: offset + rows.length < total,
    counts: {
      new: Number(counts.new ?? 0),
      contacted: Number(counts.contacted ?? 0),
      closed: Number(counts.closed ?? 0),
    },
    links: (linksResult.rows as LinkRow[]).map((row) => ({
      id: row.id,
      locationId: row.location_id,
      token: row.token,
      enabled: row.enabled === true,
      createdAt: toIso(row.created_at)!,
    })),
  };
}

type ActiveMember = { role: string; location_scope_mode: string };

/**
 * Repite dentro de la transacción lo que `resolveOwnerScope` comprobó fuera:
 * miembro activo con el mismo rol y alcance de sedes.
 */
async function assertActiveMember(
  tx: TransactionClient,
  input: { scope: OwnerScope; userId: string }
): Promise<ActiveMember> {
  const member = await tx.execute(sql`
    select role::text as role, location_scope_mode::text as location_scope_mode
    from zaltyko.organization_members
    where organization_id = ${input.scope.organization.id}::uuid
      and id = ${input.scope.member.id}::uuid
      and user_id = ${input.userId}::uuid
      and status = 'active'
    for share
  `);
  const row = member.rows[0] as ActiveMember | undefined;
  if (
    !row ||
    row.role !== input.scope.member.role ||
    row.location_scope_mode !== input.scope.member.locationScopeMode ||
    !["owner", "admin", "manager"].includes(row.role)
  ) {
    throw new OperationalError("FORBIDDEN", "El acceso ha cambiado; vuelve a cargar la página", 403);
  }
  return row;
}

type LockedRequest = {
  id: string;
  location_id: string;
  status: TrialRequestStatus;
  revision: number | string;
  athlete_given_name: string;
  created_at: unknown;
  anonymized_at: unknown;
};

/**
 * Bloquea la solicitud si es de esta academia y, cuando la persona no ve todas
 * las sedes, de una sede asignada. Otra academia u otra sede responden 404
 * para no confirmar que existe.
 */
async function lockScopedRequest(
  tx: TransactionClient,
  input: { scope: OwnerScope; userId: string; requestId: string }
): Promise<LockedRequest> {
  const member = await assertActiveMember(tx, input);
  const request = await tx.execute(sql`
    select r.id::text as id, r.location_id::text as location_id, r.status, r.revision,
           r.athlete_given_name, r.created_at, r.anonymized_at
    from zaltyko.admission_requests r
    where r.organization_id = ${input.scope.organization.id}::uuid
      and r.id = ${input.requestId}::uuid
      and (
        ${member.location_scope_mode} = 'all'
        or exists (
          select 1 from zaltyko.member_location_scopes s
          where s.organization_id = r.organization_id
            and s.member_id = ${input.scope.member.id}::uuid
            and s.location_id = r.location_id
        )
      )
    for update of r
  `);
  const locked = request.rows[0] as LockedRequest | undefined;
  if (!locked) throw requestNotFound();
  return locked;
}

export type TrialRequestMutationResult = {
  id: string;
  status: TrialRequestStatus;
  revision: number;
  convertedAthleteId: string | null;
  waitlistEntryId: string | null;
};

export async function changeTrialRequestStatus(input: {
  scope: OwnerScope;
  userId: string;
  requestId: string;
  expectedRevision: number;
  status: "contacted" | "declined";
}): Promise<TrialRequestMutationResult> {
  if (!guid.safeParse(input.requestId).success) throw requestNotFound();
  return db.transaction(async (tx) => {
    await assertAdmissionStorageAvailable(tx);
    // Mismo orden de bloqueo que la conversión: academia y después solicitud.
    await lockOrganizationForSaasMutation(tx, input.scope.organization.id);
    const locked = await lockScopedRequest(tx, input);
    if (Number(locked.revision) !== input.expectedRevision) throw staleRequest();
    if (locked.anonymized_at !== null || !canTransitionTrialRequest(locked.status, input.status)) {
      throw new OperationalError("INVALID_STATE_TRANSITION", "Esta solicitud ya no admite ese cambio", 409);
    }
    const nextRevision = input.expectedRevision + 1;
    await tx.execute(sql`
      update zaltyko.admission_requests
      set status = ${input.status},
          handled_by_member_id = ${input.scope.member.id}::uuid,
          handled_at = now(),
          revision = ${nextRevision},
          updated_at = now()
      where organization_id = ${input.scope.organization.id}::uuid
        and id = ${locked.id}::uuid
        and revision = ${input.expectedRevision}
    `);
    await appendAuditEntry(tx, {
      organizationId: input.scope.organization.id,
      locationId: locked.location_id,
      actorUserId: input.userId,
      action: "admission_request.status_changed",
      targetType: "admission_request",
      targetId: locked.id,
      idempotencyKey: `admission-request:${locked.id}:r${nextRevision}`,
      before: { status: locked.status, revision: Number(locked.revision) },
      after: { status: input.status, revision: nextRevision },
    });
    return { id: locked.id, status: input.status, revision: nextRevision, convertedAthleteId: null, waitlistEntryId: null };
  });
}

function requestDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString().slice(0, 10);
}

/**
 * Pasa una solicitud a inscripción o a lista de espera en UNA transacción:
 * 1. bloqueo de la academia (`lockOrganizationForSaasMutation`);
 * 2. `FOR UPDATE` de la solicitud dentro del alcance;
 * 3. revisión y estado;
 * 4. alta canónica (`createOwnerAthleteIntakeInTx`): ficha y familia;
 * 5. si el destino es la espera, `joinWaitlistInTx`;
 * 6. actualización de la solicitud;
 * 7. auditoría.
 * Si cualquier paso falla no queda nada: ni ficha huérfana ni clave usada.
 */
export async function convertTrialRequest(input: {
  scope: OwnerScope;
  userId: string;
  requestId: string;
  command: OwnerTrialRequestConvertCommand;
}): Promise<TrialRequestMutationResult> {
  if (!guid.safeParse(input.requestId).success) throw requestNotFound();
  if (!canManageTrialRequests(input.scope)) throw managersOnly("Pasar una solicitud a gimnasta");
  const organizationId = input.scope.organization.id;
  const actor = { userId: input.userId, memberId: input.scope.member.id };
  const expectedRevision = input.command.expectedRevision;

  return db.transaction(async (tx) => {
    await assertAdmissionStorageAvailable(tx);
    await lockOrganizationForSaasMutation(tx, organizationId);
    const locked = await lockScopedRequest(tx, input);
    if (Number(locked.revision) !== expectedRevision) throw staleRequest();
    if (!isOpenTrialRequest(locked.status) || locked.anonymized_at !== null) {
      throw new OperationalError("INVALID_STATE_TRANSITION", "Esta solicitud ya está cerrada", 409);
    }
    if (input.command.destination === "waitlist") {
      const template = await tx.execute(sql`
        select 1 from zaltyko.class_templates
        where organization_id = ${organizationId}::uuid
          and location_id = ${locked.location_id}::uuid
          and id = ${input.command.classTemplateId}::uuid
          and status = 'active'
      `);
      if (template.rows.length === 0) {
        throw new OperationalError("NOT_FOUND", "Elige una clase activa de la sede de la solicitud", 404);
      }
    }

    const intake = await createOwnerAthleteIntakeInTx(tx, {
      organizationId,
      givenName: locked.athlete_given_name,
      familyName: input.command.familyName,
      family: { kind: "new", relationship: input.command.relationship, startsOn: requestDate(locked.created_at) },
      userId: input.userId,
      idempotencyKey: trialRequestIntakeKey(locked.id, expectedRevision),
      actor,
    });

    let waitlistEntryId: string | null = null;
    if (input.command.destination === "waitlist" && input.command.classTemplateId) {
      const entry = await joinWaitlistInTx(tx, {
        organizationId,
        locationId: locked.location_id,
        athleteId: intake.athleteId,
        classTemplateId: input.command.classTemplateId,
        programId: null,
        contactable: false,
        contactConsentStatus: "unknown",
        idempotencyKey: trialRequestWaitlistKey(locked.id, expectedRevision),
        actor,
      });
      waitlistEntryId = entry.id;
    }

    const status: TrialRequestStatus = waitlistEntryId ? "waitlisted" : "converted";
    const nextRevision = expectedRevision + 1;
    const updated = await tx.execute(sql`
      update zaltyko.admission_requests
      set status = ${status},
          converted_athlete_id = ${intake.athleteId}::uuid,
          waitlist_entry_id = ${waitlistEntryId}::uuid,
          handled_by_member_id = ${input.scope.member.id}::uuid,
          handled_at = now(),
          revision = ${nextRevision},
          updated_at = now()
      where organization_id = ${organizationId}::uuid
        and id = ${locked.id}::uuid
        and revision = ${expectedRevision}
        and status in ('new', 'contacted')
      returning id
    `);
    if (updated.rows.length === 0) throw staleRequest();
    await appendAuditEntry(tx, {
      organizationId,
      locationId: locked.location_id,
      actorUserId: input.userId,
      action: "admission_request.converted",
      targetType: "admission_request",
      targetId: locked.id,
      idempotencyKey: `admission-request:${locked.id}:r${nextRevision}`,
      before: { status: locked.status, revision: Number(locked.revision) },
      after: { status, revision: nextRevision, athleteId: intake.athleteId, waitlistEntryId },
    });
    return { id: locked.id, status, revision: nextRevision, convertedAthleteId: intake.athleteId, waitlistEntryId };
  });
}

/**
 * Suprime los datos personales de una solicitud descartada y conserva el
 * registro (fecha, sede, estado, auditoría). Irreversible.
 */
export async function anonymizeTrialRequest(input: {
  scope: OwnerScope;
  userId: string;
  requestId: string;
  expectedRevision: number;
}): Promise<TrialRequestMutationResult> {
  if (!guid.safeParse(input.requestId).success) throw requestNotFound();
  if (!managingRoles.has(input.scope.member.role)) {
    throw new OperationalError("FORBIDDEN", "Eliminar datos personales requiere la dirección o la administración", 403);
  }
  return db.transaction(async (tx) => {
    await assertAdmissionStorageAvailable(tx);
    // Mismo orden de bloqueo que la conversión (academia → solicitud): las
    // inserciones de auditoría toman KEY SHARE sobre la academia y, sin este
    // orden, una conversión y esta operación podrían bloquearse mutuamente.
    await lockOrganizationForSaasMutation(tx, input.scope.organization.id);
    const locked = await lockScopedRequest(tx, input);
    if (Number(locked.revision) !== input.expectedRevision) throw staleRequest();
    if (locked.status !== "declined" || locked.anonymized_at !== null) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "Solo se eliminan los datos de solicitudes descartadas",
        409
      );
    }
    const nextRevision = input.expectedRevision + 1;
    await tx.execute(sql`
      update zaltyko.admission_requests
      set contact_name = ${ANONYMIZED_CONTACT_NAME},
          contact_email = ${anonymizedContactEmail(locked.id)},
          contact_phone = null,
          athlete_given_name = ${ANONYMIZED_ATHLETE_NAME},
          athlete_birth_year = null,
          message = null,
          anonymized_at = now(),
          handled_by_member_id = ${input.scope.member.id}::uuid,
          handled_at = now(),
          revision = ${nextRevision},
          updated_at = now()
      where organization_id = ${input.scope.organization.id}::uuid
        and id = ${locked.id}::uuid
        and revision = ${input.expectedRevision}
    `);
    await appendAuditEntry(tx, {
      organizationId: input.scope.organization.id,
      locationId: locked.location_id,
      actorUserId: input.userId,
      action: "admission_request.personal_data_erased",
      targetType: "admission_request",
      targetId: locked.id,
      idempotencyKey: `admission-request:${locked.id}:r${nextRevision}`,
      before: { status: locked.status, revision: Number(locked.revision) },
      after: { status: locked.status, revision: nextRevision, anonymized: true },
    });
    return { id: locked.id, status: locked.status, revision: nextRevision, convertedAthleteId: null, waitlistEntryId: null };
  });
}

/* ------------------------------------------------------------------------ */
/* Enlaces públicos                                                          */
/* ------------------------------------------------------------------------ */

export function newAdmissionLinkToken(): string {
  return randomBytes(16).toString("hex");
}

export type AdmissionLinkResult = OwnerAdmissionLink | null;

/**
 * Activa, desactiva o regenera el enlace de la academia (general si
 * `locationId` es null, o de una sede). Solo dirección o administración con
 * todas las sedes. Regenerar revoca el anterior: deja de funcionar al momento.
 */
export async function manageAdmissionLink(input: {
  scope: OwnerScope;
  userId: string;
  locationId: string | null;
  action: "enable" | "disable" | "regenerate";
}): Promise<AdmissionLinkResult> {
  if (!canManageTrialRequests(input.scope)) throw managersOnly("Gestionar el enlace para familias");
  const organizationId = input.scope.organization.id;
  if (input.locationId) trialRequestLocationIds(input.scope, input.locationId);

  return db.transaction(async (tx) => {
    await assertAdmissionStorageAvailable(tx);
    const member = await assertActiveMember(tx, input);
    if (!managingRoles.has(member.role) || member.location_scope_mode !== "all") {
      throw managersOnly("Gestionar el enlace para familias");
    }
    if (input.locationId) {
      const location = await tx.execute(sql`
        select 1 from zaltyko.locations
        where organization_id = ${organizationId}::uuid and id = ${input.locationId}::uuid
      `);
      if (location.rows.length === 0) throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
    }
    const slot = input.locationId ?? "organization";
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:admission-link:${slot}`}, 0))`
    );
    const current = await tx.execute(sql`
      select id::text as id, enabled
      from zaltyko.admission_links
      where organization_id = ${organizationId}::uuid
        and revoked_at is null
        and ${input.locationId ? sql`location_id = ${input.locationId}::uuid` : sql`location_id is null`}
      for update
    `);
    const existing = current.rows[0] as { id: string; enabled: boolean } | undefined;

    const audit = (action: string, linkId: string, before: Record<string, unknown> | null, after: Record<string, unknown>) =>
      appendAuditEntry(tx, {
        organizationId,
        locationId: input.locationId,
        actorUserId: input.userId,
        action,
        targetType: "admission_link",
        targetId: linkId,
        idempotencyKey: `admission-link:${linkId}:${action}:${randomUUID()}`,
        before,
        after,
      });

    const create = async () => {
      const inserted = await tx.execute(sql`
        insert into zaltyko.admission_links (organization_id, location_id, token, created_by_member_id)
        values (${organizationId}::uuid, ${input.locationId}::uuid, ${newAdmissionLinkToken()}, ${input.scope.member.id}::uuid)
        returning id::text as id
      `);
      const id = (inserted.rows[0] as { id: string }).id;
      await audit("admission_link.created", id, null, { enabled: true });
      return id;
    };

    let linkId: string;
    if (input.action === "enable") {
      if (existing) {
        if (!existing.enabled) {
          await tx.execute(sql`update zaltyko.admission_links set enabled = true where id = ${existing.id}::uuid`);
          await audit("admission_link.enabled", existing.id, { enabled: false }, { enabled: true });
        }
        linkId = existing.id;
      } else {
        linkId = await create();
      }
    } else if (input.action === "disable") {
      if (!existing) throw new OperationalError("NOT_FOUND", "No hay ningún enlace activo", 404);
      if (existing.enabled) {
        await tx.execute(sql`update zaltyko.admission_links set enabled = false where id = ${existing.id}::uuid`);
        await audit("admission_link.disabled", existing.id, { enabled: true }, { enabled: false });
      }
      linkId = existing.id;
    } else {
      if (existing) {
        await tx.execute(sql`
          update zaltyko.admission_links set enabled = false, revoked_at = now() where id = ${existing.id}::uuid
        `);
        await audit("admission_link.revoked", existing.id, { enabled: existing.enabled }, { enabled: false, revoked: true });
      }
      linkId = await create();
    }

    const result = await tx.execute(sql`
      select id::text as id, location_id::text as location_id, token, enabled, created_at
      from zaltyko.admission_links where id = ${linkId}::uuid
    `);
    const row = result.rows[0] as { id: string; location_id: string | null; token: string; enabled: boolean; created_at: unknown };
    return { id: row.id, locationId: row.location_id, token: row.token, enabled: row.enabled === true, createdAt: toIso(row.created_at)! };
  });
}
