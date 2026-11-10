import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { createOwnerAthleteIntake } from "@/modules/athletes/application/owner-athlete-intake";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";
import { joinWaitlist } from "@/modules/waitlists/application/waitlist-service";

import {
  TRIAL_REQUEST_PRIVACY_VERSION,
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
  admissionStorageUnavailable,
  assertAdmissionStorageAvailable,
  isAdmissionStorageAvailable,
} from "./admission-storage";

/** Estados de academia que pueden recibir solicitudes públicas. */
const receivingOrganizationStatuses = ["trial", "active"] as const;
const convertingRoles = new Set(["owner", "admin"]);

const notReceiving = () =>
  new OperationalError(
    "NOT_FOUND",
    "Esta academia no recibe solicitudes en línea.",
    404
  );
const requestNotFound = () =>
  new OperationalError("NOT_FOUND", "Solicitud no encontrada", 404);
const staleRequest = () =>
  new OperationalError(
    "VERSION_CONFLICT",
    "La solicitud ha cambiado. Vuelve a cargar la bandeja.",
    409
  );

const guid = z.guid();

/* ------------------------------------------------------------------------ */
/* Público                                                                   */
/* ------------------------------------------------------------------------ */

export type PublicAdmissionTarget = {
  organizationId: string;
  organizationName: string;
  locations: Array<{ id: string; name: string }>;
  available: boolean;
};

/**
 * Lo único que la página pública muestra de una academia: su nombre y sus
 * sedes activas. Nada de equipo, gimnastas, horarios ni contacto interno.
 */
export async function getPublicAdmissionTarget(
  organizationId: string
): Promise<PublicAdmissionTarget | null> {
  if (!guid.safeParse(organizationId).success) return null;
  const normalizedId = organizationId.toLowerCase();
  const organization = await db.execute(sql`
    select o.id::text as id, o.name
    from zaltyko.organizations o
    where o.id = ${normalizedId}::uuid
      and o.status::text in (${sql.join(receivingOrganizationStatuses.map((status) => sql`${status}`), sql`, `)})
    limit 1
  `);
  const row = organization.rows[0] as { id: string; name: string } | undefined;
  if (!row) return null;
  const locations = await db.execute(sql`
    select l.id::text as id, l.name
    from zaltyko.locations l
    where l.organization_id = ${normalizedId}::uuid
      and l.is_active = true
    order by l.name asc, l.id asc
    limit 50
  `);
  return {
    organizationId: row.id,
    organizationName: row.name,
    locations: (locations.rows as Array<{ id: string; name: string }>).map((location) => ({
      id: location.id,
      name: location.name,
    })),
    available: await isAdmissionStorageAvailable(db),
  };
}

export type PublicTrialRequestResult = { requestId: string; replayed: boolean };

type StoredSubmission = {
  id: string;
  location_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  athlete_given_name: string;
  athlete_birth_year: number | null;
  message: string | null;
};

function sameSubmission(stored: StoredSubmission, input: PublicTrialRequest, locationId: string): boolean {
  return (
    stored.location_id === locationId &&
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

    const organization = await tx.execute(sql`
      select o.id
      from zaltyko.organizations o
      where o.id = ${input.organizationId}::uuid
        and o.status::text in (${sql.join(receivingOrganizationStatuses.map((status) => sql`${status}`), sql`, `)})
      for share
    `);
    if (organization.rows.length === 0) throw notReceiving();

    const locationRows = await tx.execute(sql`
      select l.id::text as id
      from zaltyko.locations l
      where l.organization_id = ${input.organizationId}::uuid
        and l.is_active = true
      order by l.id
      limit 50
    `);
    const activeLocationIds = (locationRows.rows as Array<{ id: string }>).map((row) => row.id);
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
        organization_id, location_id, submission_id,
        contact_name, contact_email, contact_phone,
        athlete_given_name, athlete_birth_year, message,
        privacy_consent_version, privacy_consent_at
      ) values (
        ${input.organizationId}::uuid, ${locationId}::uuid, ${input.submissionId}::uuid,
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
      select id::text as id, location_id::text as location_id, contact_name, contact_email,
             contact_phone, athlete_given_name, athlete_birth_year, message
      from zaltyko.admission_requests
      where organization_id = ${input.organizationId}::uuid
        and submission_id = ${input.submissionId}::uuid
      limit 1
    `);
    const stored = existing.rows[0] as StoredSubmission | undefined;
    if (!stored || !sameSubmission(stored, input, locationId)) {
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
  revision: number;
  convertedAthleteId: string | null;
  waitlistEntryId: string | null;
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
  classOptions: Array<{ id: string; name: string; locationId: string }>;
  canConvert: boolean;
};

export function canConvertTrialRequests(scope: Pick<OwnerScope, "member">): boolean {
  return convertingRoles.has(scope.member.role) && scope.member.locationScopeMode === "all";
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
    classOptions: [],
    canConvert: canConvertTrialRequests(scope),
  };
  if (!(await isAdmissionStorageAvailable(db))) return empty;
  if (locationIds.length === 0) return { ...empty, available: true };

  const statuses: readonly TrialRequestStatus[] =
    input.view === "open" ? openTrialRequestStatuses : closedTrialRequestStatuses;
  const statusList = sql.join(statuses.map((status) => sql`${status}`), sql`, `);
  const offset = (input.page - 1) * input.pageSize;

  const [itemsResult, countsResult, classesResult] = await Promise.all([
    db.execute(sql`
      select r.id::text as id, r.location_id::text as location_id, l.name as location_name,
             r.status, r.contact_name, r.contact_email, r.contact_phone,
             r.athlete_given_name, r.athlete_birth_year, r.message,
             r.created_at, r.handled_at, r.revision,
             r.converted_athlete_id::text as converted_athlete_id,
             r.waitlist_entry_id::text as waitlist_entry_id,
             count(*) over ()::int as total
      from zaltyko.admission_requests r
      join zaltyko.locations l
        on l.organization_id = r.organization_id
       and l.id = r.location_id
      where r.organization_id = ${organizationId}::uuid
        and r.location_id = any(${sqlUuidArray(locationIds)})
        and r.status in (${statusList})
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
    db.execute(sql`
      select ct.id::text as id, ct.name, ct.location_id::text as location_id
      from zaltyko.class_templates ct
      where ct.organization_id = ${organizationId}::uuid
        and ct.location_id = any(${sqlUuidArray(locationIds)})
        and ct.status = 'active'
      order by ct.name asc, ct.id asc
      limit 200
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
    revision: number | string;
    converted_athlete_id: string | null;
    waitlist_entry_id: string | null;
    total: number | string;
  };
  const rows = itemsResult.rows as Row[];
  const counts = (countsResult.rows[0] ?? {}) as { new?: number | string; contacted?: number | string; closed?: number | string };
  const total = rows.length > 0 ? Number(rows[0]!.total) : 0;

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
    classOptions: (classesResult.rows as Array<{ id: string; name: string; location_id: string }>).map((row) => ({
      id: row.id,
      name: row.name,
      locationId: row.location_id,
    })),
  };
}

type LockedRequest = {
  id: string;
  location_id: string;
  status: TrialRequestStatus;
  revision: number | string;
  athlete_given_name: string;
  created_at: unknown;
};

/**
 * Repite dentro de la transacción lo que `resolveOwnerScope` comprobó fuera:
 * miembro activo con el mismo rol y, si no ve todas las sedes, asignado a la
 * sede de la solicitud. Una solicitud de otra academia o de otra sede responde
 * 404 para no confirmar que existe.
 */
async function lockScopedRequest(
  tx: TransactionClient,
  input: { scope: OwnerScope; userId: string; requestId: string }
): Promise<LockedRequest> {
  const organizationId = input.scope.organization.id;
  const member = await tx.execute(sql`
    select role::text as role, location_scope_mode::text as location_scope_mode
    from zaltyko.organization_members
    where organization_id = ${organizationId}::uuid
      and id = ${input.scope.member.id}::uuid
      and user_id = ${input.userId}::uuid
      and status = 'active'
    for share
  `);
  const row = member.rows[0] as { role: string; location_scope_mode: string } | undefined;
  if (
    !row ||
    row.role !== input.scope.member.role ||
    row.location_scope_mode !== input.scope.member.locationScopeMode ||
    !["owner", "admin", "manager"].includes(row.role)
  ) {
    throw new OperationalError("FORBIDDEN", "El acceso ha cambiado; vuelve a cargar la página", 403);
  }

  const request = await tx.execute(sql`
    select r.id::text as id, r.location_id::text as location_id, r.status, r.revision,
           r.athlete_given_name, r.created_at
    from zaltyko.admission_requests r
    where r.organization_id = ${organizationId}::uuid
      and r.id = ${input.requestId}::uuid
      and (
        ${row.location_scope_mode} = 'all'
        or exists (
          select 1 from zaltyko.member_location_scopes s
          where s.organization_id = r.organization_id
            and s.member_id = ${input.scope.member.id}::uuid
            and s.location_id = r.location_id
        )
      )
    for update
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
    const locked = await lockScopedRequest(tx, input);
    if (Number(locked.revision) !== input.expectedRevision) throw staleRequest();
    if (!canTransitionTrialRequest(locked.status, input.status)) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "Esta solicitud ya no admite ese cambio",
        409
      );
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
    return {
      id: locked.id,
      status: input.status,
      revision: nextRevision,
      convertedAthleteId: null,
      waitlistEntryId: null,
    };
  });
}

function requestDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString().slice(0, 10);
}

/**
 * Pasa una solicitud a inscripción o a lista de espera sin duplicar datos:
 * 1. `createOwnerAthleteIntake` crea la ficha y la familia (la gimnasta queda en
 *    la bandeja de altas, donde se inscribe en un grupo);
 * 2. si el destino es la espera, `joinWaitlist` la apunta en la clase;
 * 3. la solicitud solo guarda los identificadores resultantes.
 * Las claves de idempotencia derivan del id de la solicitud, así que un
 * reintento tras un fallo intermedio reutiliza lo ya creado.
 */
export async function convertTrialRequest(input: {
  scope: OwnerScope;
  userId: string;
  requestId: string;
  command: OwnerTrialRequestConvertCommand;
}): Promise<TrialRequestMutationResult> {
  if (!guid.safeParse(input.requestId).success) throw requestNotFound();
  if (!canConvertTrialRequests(input.scope)) {
    throw new OperationalError(
      "FORBIDDEN",
      "Pasar una solicitud a gimnasta requiere la dirección o administración con todas las sedes",
      403
    );
  }
  const organizationId = input.scope.organization.id;
  const actor = { userId: input.userId, memberId: input.scope.member.id };

  const prepared = await db.transaction(async (tx) => {
    await assertAdmissionStorageAvailable(tx);
    const locked = await lockScopedRequest(tx, input);
    if (Number(locked.revision) !== input.command.expectedRevision) throw staleRequest();
    if (!isOpenTrialRequest(locked.status)) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "Esta solicitud ya está cerrada",
        409
      );
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
        throw new OperationalError(
          "NOT_FOUND",
          "Elige una clase activa de la sede de la solicitud",
          404
        );
      }
    }
    return locked;
  });

  const intake = await createOwnerAthleteIntake({
    organizationId,
    givenName: prepared.athlete_given_name,
    familyName: input.command.familyName,
    family: {
      kind: "new",
      relationship: input.command.relationship,
      startsOn: requestDate(prepared.created_at),
    },
    userId: input.userId,
    idempotencyKey: trialRequestIntakeKey(prepared.id),
    actor,
  });

  let waitlistEntryId: string | null = null;
  if (input.command.destination === "waitlist" && input.command.classTemplateId) {
    const entry = await joinWaitlist({
      organizationId,
      locationId: prepared.location_id,
      athleteId: intake.athleteId,
      classTemplateId: input.command.classTemplateId,
      programId: null,
      contactable: false,
      contactConsentStatus: "unknown",
      idempotencyKey: trialRequestWaitlistKey(prepared.id),
      actor,
    });
    waitlistEntryId = entry.id;
  }

  const status: TrialRequestStatus = waitlistEntryId ? "waitlisted" : "converted";
  const nextRevision = input.command.expectedRevision + 1;
  return db.transaction(async (tx) => {
    if (!(await isAdmissionStorageAvailable(tx))) throw admissionStorageUnavailable();
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
        and id = ${prepared.id}::uuid
        and location_id = ${prepared.location_id}::uuid
        and revision = ${input.command.expectedRevision}
        and status in ('new', 'contacted')
      returning id
    `);
    if (updated.rows.length === 0) throw staleRequest();
    await appendAuditEntry(tx, {
      organizationId,
      locationId: prepared.location_id,
      actorUserId: input.userId,
      action: "admission_request.converted",
      targetType: "admission_request",
      targetId: prepared.id,
      idempotencyKey: `admission-request:${prepared.id}:r${nextRevision}`,
      before: { status: prepared.status, revision: Number(prepared.revision) },
      after: {
        status,
        revision: nextRevision,
        athleteId: intake.athleteId,
        waitlistEntryId,
      },
    });
    return {
      id: prepared.id,
      status,
      revision: nextRevision,
      convertedAthleteId: intake.athleteId,
      waitlistEntryId,
    };
  });
}
