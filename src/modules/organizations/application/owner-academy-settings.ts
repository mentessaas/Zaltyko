import { createHash } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { locations, organizationMembers, programs } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { defaultLocationCode } from "@/modules/organizations/domain/academy-offerings";
import { resolveAdministrativeMarket } from "@/modules/organizations/domain/administrative-market-capabilities";
import {
  resolveEffectiveOrganizationEntitlement,
  type EffectiveSaasPlanCode,
} from "@/modules/saas-billing/application/entitlement-service";
import {
  assertOrganizationOperationalWritable,
  getOrganizationUsage,
} from "@/modules/saas-billing/application/organization-usage";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

/**
 * Ajustes de la academia en el panel nuevo (`/owner/settings`).
 *
 * Solo trabaja con lo que ya guarda el modelo canónico: el nombre comercial y
 * la razón social de `zaltyko.organizations`, y las sedes de
 * `zaltyko.locations`. País, moneda y zona horaria se fijan en el alta y aquí
 * solo se leen. Únicamente la persona titular (`owner`) con acceso a todas las
 * sedes puede leer y cambiar estos datos; se comprueba dentro de la
 * transacción, aunque la ruta ya lo haya hecho.
 */

export const ACADEMY_LOCATION_LIST_LIMIT = 100;
const PROGRAM_LIST_LIMIT = 50;
const LOCATION_CODE_SCAN_LIMIT = 200;

const profileEventName = "organization.profile_updated";
const locationEventName = "location.created";

const idSchema = z.guid();
const commandKeySchema = z.string().trim().min(8).max(180);
const exactVersionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u)
  .refine((value) => Number.isFinite(Date.parse(value)));

export function normalizeAcademyText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

const visibleText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
    .transform(normalizeAcademyText);

/** Mismos límites que el alta (`bootstrapOrganization`). */
export const academyNameSchema = visibleText(2, 120);
export const academyLegalNameSchema = visibleText(2, 180);
export const locationNameSchema = visibleText(2, 120);
export const locationTimezoneSchema = z.string().trim().min(1).max(80);

const scopeSchema = z
  .object({ organizationId: idSchema, actor: operationalActorSchema })
  .strict();

const updateProfileSchema = scopeSchema
  .extend({
    expectedUpdatedAt: exactVersionSchema,
    name: academyNameSchema,
    legalName: academyLegalNameSchema.nullable(),
    idempotencyKey: commandKeySchema,
  })
  .strict();

const createLocationSchema = scopeSchema
  .extend({
    name: locationNameSchema,
    timezone: locationTimezoneSchema,
    idempotencyKey: commandKeySchema,
  })
  .strict();

export type OwnerAcademySettingsScope = z.input<typeof scopeSchema>;
export type UpdateOwnerAcademyProfileInput = z.input<typeof updateProfileSchema>;
export type CreateOwnerLocationInput = z.input<typeof createLocationSchema>;

export type OwnerAcademyProfile = {
  id: string;
  name: string;
  legalName: string | null;
  countryCode: string;
  countryLabel: string;
  defaultCurrency: string;
  defaultTimezone: string;
  updatedAt: string;
};

export type OwnerAcademyLocation = {
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
};

export type OwnerLocationCapacity = {
  planCode: EffectiveSaasPlanCode;
  activeLocations: number;
  /** null: el plan no limita las sedes (Network). */
  locationLimit: number | null;
  canAddLocation: boolean;
  /** Por qué no se puede añadir otra sede ahora mismo. */
  blockedReason: "plan_limit" | "read_only" | null;
};

export type OwnerAcademySettings = {
  organization: OwnerAcademyProfile;
  programs: Array<{ name: string; kind: "gymnastics_sport" | "complementary_activity" }>;
  locations: OwnerAcademyLocation[];
  locationsTruncated: boolean;
  locationCapacity: OwnerLocationCapacity;
  /** Zonas horarias que acepta una sede nueva (las del país de la academia). */
  timezoneOptions: string[];
};

type OrganizationRow = {
  id: string;
  name: string;
  legal_name: string | null;
  country_code: string;
  default_currency: string;
  default_timezone: string;
  updated_at: string;
};

function versionConflict(): OperationalError {
  return new OperationalError(
    "VERSION_CONFLICT",
    "Otra persona ha cambiado los datos de la academia mientras editabas. Recarga la página y vuelve a guardar.",
    409
  );
}

function forbidden(): OperationalError {
  return new OperationalError(
    "FORBIDDEN",
    "Solo la persona titular de la academia, con acceso a todas las sedes, puede cambiar estos ajustes.",
    403
  );
}

function fingerprint(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function assertOwnerSettingsAccess(
  tx: TransactionClient,
  input: z.infer<typeof scopeSchema>
): Promise<void> {
  const [member] = await tx
    .select({
      role: organizationMembers.role,
      locationScopeMode: organizationMembers.locationScopeMode,
    })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.id, input.actor.memberId),
        eq(organizationMembers.organizationId, input.organizationId),
        eq(organizationMembers.userId, input.actor.userId),
        eq(organizationMembers.status, "active")
      )
    )
    .limit(1);
  if (!member || member.role !== "owner" || member.locationScopeMode !== "all") {
    throw forbidden();
  }
}

async function loadOrganization(
  tx: TransactionClient,
  organizationId: string
): Promise<OrganizationRow> {
  const result = await tx.execute(sql`
    select
      o.id,
      o.name,
      o.legal_name,
      o.country_code,
      o.default_currency,
      o.default_timezone,
      to_char(o.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
    from zaltyko.organizations o
    where o.id = ${organizationId}::uuid
    limit 1
  `);
  const row = result.rows[0] as OrganizationRow | undefined;
  if (!row) {
    throw new OperationalError("NOT_FOUND", "Academia no encontrada", 404);
  }
  return row;
}

function toProfile(row: OrganizationRow): OwnerAcademyProfile {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    countryCode: row.country_code,
    countryLabel:
      resolveAdministrativeMarket(row.country_code)?.label ?? row.country_code,
    defaultCurrency: row.default_currency,
    defaultTimezone: row.default_timezone,
    updatedAt: row.updated_at,
  };
}

/** Zonas horarias de una sede nueva: las del país, con la de la academia primero. */
export function locationTimezoneOptions(
  countryCode: string,
  defaultTimezone: string
): string[] {
  const countryTimezones = resolveAdministrativeMarket(countryCode)?.timezones ?? [];
  return [...new Set([defaultTimezone, ...countryTimezones])];
}

function assertValidTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: value }).format();
  } catch {
    throw new OperationalError(
      "INVALID_RELATION",
      "La zona horaria de la sede no es válida.",
      422
    );
  }
}

async function countActiveLocations(
  tx: TransactionClient,
  organizationId: string
): Promise<number> {
  const result = await tx.execute(sql`
    select count(*)::text as active
    from zaltyko.locations
    where organization_id = ${organizationId}::uuid and is_active
  `);
  const value = (result.rows[0] as { active?: unknown } | undefined)?.active;
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "No se ha podido comprobar cuántas sedes tiene la academia.",
      503
    );
  }
  return Number(value);
}

function locationLimitReached(
  activeLocations: number,
  locationLimit: number | null
): boolean {
  return locationLimit !== null && activeLocations >= locationLimit;
}

export function locationLimitMessage(locationLimit: number): string {
  return locationLimit === 1
    ? "Tu plan incluye 1 sede. Para añadir otra necesitas el plan Network, que incluye varias sedes."
    : `Tu plan incluye ${locationLimit} sedes y ya las tienes todas. Para añadir otra necesitas ampliar el plan.`;
}

export async function getOwnerAcademySettings(
  input: OwnerAcademySettingsScope
): Promise<OwnerAcademySettings> {
  const scope = scopeSchema.parse(input);
  return db.transaction(async (tx) => {
    await assertOwnerSettingsAccess(tx, scope);
    const organization = await loadOrganization(tx, scope.organizationId);
    const programRows = await tx
      .select({ name: programs.name, kind: programs.kind })
      .from(programs)
      .where(
        and(
          eq(programs.organizationId, scope.organizationId),
          eq(programs.status, "active")
        )
      )
      .orderBy(asc(programs.kind), asc(programs.name))
      .limit(PROGRAM_LIST_LIMIT);
    const locationRows = await tx
      .select({
        id: locations.id,
        name: locations.name,
        timezone: locations.timezone,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(eq(locations.organizationId, scope.organizationId))
      .orderBy(asc(locations.createdAt), asc(locations.id))
      .limit(ACADEMY_LOCATION_LIST_LIMIT + 1);
    const entitlement = await resolveEffectiveOrganizationEntitlement(
      tx,
      scope.organizationId
    );
    const usage = await getOrganizationUsage(tx, scope.organizationId);
    const activeLocations = await countActiveLocations(tx, scope.organizationId);
    const locationLimit = entitlement.limits.academyLimit;
    const blockedReason = locationLimitReached(activeLocations, locationLimit)
      ? "plan_limit"
      : usage.readOnly
        ? "read_only"
        : null;

    return {
      organization: toProfile(organization),
      programs: programRows,
      locations: locationRows.slice(0, ACADEMY_LOCATION_LIST_LIMIT),
      locationsTruncated: locationRows.length > ACADEMY_LOCATION_LIST_LIMIT,
      locationCapacity: {
        planCode: entitlement.planCode,
        activeLocations,
        locationLimit,
        canAddLocation: blockedReason === null,
        blockedReason,
      },
      timezoneOptions: locationTimezoneOptions(
        organization.country_code,
        organization.default_timezone
      ),
    };
  });
}

export type UpdatedOwnerAcademyProfile = OwnerAcademyProfile & {
  changed: boolean;
  replayed: boolean;
};

/**
 * Cambia el nombre comercial y la razón social con control de versión: si la
 * academia cambió desde que se leyó, responde 409 sin escribir. No pasa por el
 * bloqueo de solo lectura del plan: renombrar no añade capacidad.
 */
export async function updateOwnerAcademyProfile(
  input: UpdateOwnerAcademyProfileInput
): Promise<UpdatedOwnerAcademyProfile> {
  const command = updateProfileSchema.parse(input);
  const commandFingerprint = fingerprint({
    organizationId: command.organizationId,
    actorUserId: command.actor.userId,
    actorMemberId: command.actor.memberId,
    expectedUpdatedAt: command.expectedUpdatedAt,
    name: command.name,
    legalName: command.legalName,
  });

  return db.transaction(async (tx) => {
    await lockCommand(tx, command.organizationId, command.idempotencyKey);
    await assertOwnerSettingsAccess(tx, command);

    const prior = await findOutboxEvent(tx, {
      organizationId: command.organizationId,
      eventName: profileEventName,
      idempotencyKey: command.idempotencyKey,
    });
    if (prior) {
      if (prior.aggregateId !== command.organizationId) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya pertenece a otra operación.",
          409
        );
      }
      assertIdempotencyPayload(prior.payload, {
        actorUserId: command.actor.userId,
        actorMemberId: command.actor.memberId,
        commandFingerprint,
      });
      const current = await loadOrganization(tx, command.organizationId);
      return { ...toProfile(current), changed: true, replayed: true };
    }

    const current = await loadOrganization(tx, command.organizationId);
    if (current.updated_at !== command.expectedUpdatedAt) throw versionConflict();

    const changedFields = [
      ...(command.name === current.name ? [] : ["organizationName"]),
      ...(command.legalName === current.legal_name ? [] : ["legalName"]),
    ];
    if (changedFields.length === 0) {
      return { ...toProfile(current), changed: false, replayed: false };
    }

    const updated = await tx.execute(sql`
      update zaltyko.organizations as o
      set name = ${command.name},
          legal_name = ${command.legalName},
          updated_at = greatest(clock_timestamp(), o.updated_at + interval '1 microsecond')
      where o.id = ${command.organizationId}::uuid
        and o.updated_at = ${command.expectedUpdatedAt}::timestamptz
      returning o.id
    `);
    if (updated.rows.length !== 1) throw versionConflict();
    const after = await loadOrganization(tx, command.organizationId);

    await appendOutboxEvent(tx, {
      organizationId: command.organizationId,
      locationId: null,
      eventName: profileEventName,
      aggregateType: "organization",
      aggregateId: command.organizationId,
      idempotencyKey: command.idempotencyKey,
      payload: {
        actorUserId: command.actor.userId,
        actorMemberId: command.actor.memberId,
        commandFingerprint,
        changedFields,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: null,
      actorUserId: command.actor.userId,
      action: profileEventName,
      targetType: "organization",
      targetId: command.organizationId,
      idempotencyKey: command.idempotencyKey,
      before: { name: current.name, legalName: current.legal_name },
      after: { name: after.name, legalName: after.legal_name },
      metadata: { commandFingerprint, changedFields },
    });

    return { ...toProfile(after), changed: true, replayed: false };
  });
}

/** Primer código libre: `base`, `base-2`, `base-3`… (máximo 32 caracteres). */
export function nextLocationCode(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < LOCATION_CODE_SCAN_LIMIT + 2; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, 32 - tail.length).replace(/-+$/u, "")}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new OperationalError(
    "INVALID_STATE_TRANSITION",
    "No hemos podido asignar un identificador a la sede. Prueba con otro nombre.",
    409
  );
}

export type CreatedOwnerLocation = OwnerAcademyLocation & { replayed: boolean };

/**
 * Da de alta otra sede si el plan lo permite. El límite es `academyLimit` del
 * plan efectivo (1 en Free, Starter y Growth; sin límite en Network) contra
 * las sedes activas. Bloquea la organización antes de contar, igual que los
 * demás recursos limitados, y no crea nada si la academia está en solo lectura.
 */
export async function createOwnerLocation(
  input: CreateOwnerLocationInput
): Promise<CreatedOwnerLocation> {
  const command = createLocationSchema.parse(input);
  const commandFingerprint = fingerprint({
    organizationId: command.organizationId,
    actorUserId: command.actor.userId,
    actorMemberId: command.actor.memberId,
    name: command.name,
    timezone: command.timezone,
  });

  return db.transaction(async (tx) => {
    await lockCommand(tx, command.organizationId, command.idempotencyKey);
    await assertOwnerSettingsAccess(tx, command);

    const prior = await findOutboxEvent(tx, {
      organizationId: command.organizationId,
      eventName: locationEventName,
      idempotencyKey: command.idempotencyKey,
    });
    if (prior) {
      assertIdempotencyPayload(prior.payload, {
        actorUserId: command.actor.userId,
        actorMemberId: command.actor.memberId,
        commandFingerprint,
      });
      const [existing] = await tx
        .select({
          id: locations.id,
          name: locations.name,
          timezone: locations.timezone,
          isActive: locations.isActive,
        })
        .from(locations)
        .where(
          and(
            eq(locations.organizationId, command.organizationId),
            eq(locations.id, prior.aggregateId)
          )
        )
        .limit(1);
      if (!existing) {
        throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
      }
      return { ...existing, replayed: true };
    }

    const organization = await loadOrganization(tx, command.organizationId);
    const allowedTimezones = locationTimezoneOptions(
      organization.country_code,
      organization.default_timezone
    );
    if (!allowedTimezones.includes(command.timezone)) {
      throw new OperationalError(
        "INVALID_RELATION",
        "Elige una zona horaria del país de la academia.",
        422
      );
    }
    assertValidTimezone(command.timezone);

    // Bloquea la organización y rechaza el alta si está en solo lectura.
    await assertOrganizationOperationalWritable(tx, command.organizationId);
    const entitlement = await resolveEffectiveOrganizationEntitlement(
      tx,
      command.organizationId
    );
    const activeLocations = await countActiveLocations(tx, command.organizationId);
    const locationLimit = entitlement.limits.academyLimit;
    if (locationLimit !== null && locationLimitReached(activeLocations, locationLimit)) {
      throw new OperationalError(
        "CAPACITY_FULL",
        locationLimitMessage(locationLimit),
        409,
        {
          resource: "locations",
          current: activeLocations,
          limit: locationLimit,
          planCode: entitlement.planCode,
        }
      );
    }

    const sameName = await tx.execute(sql`
      select 1
      from zaltyko.locations
      where organization_id = ${command.organizationId}::uuid
        and lower(btrim(name)) = lower(${command.name})
      limit 1
    `);
    if (sameName.rows.length > 0) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "Ya hay una sede con ese nombre en tu academia. Usa otro nombre.",
        409
      );
    }

    const baseCode = defaultLocationCode(command.name);
    const takenRows = await tx
      .select({ code: locations.code })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, command.organizationId),
          sql`(${locations.code} = ${baseCode} or ${locations.code} like ${`${baseCode.slice(0, 24)}%`})`
        )
      )
      .limit(LOCATION_CODE_SCAN_LIMIT);
    const code = nextLocationCode(
      baseCode,
      new Set(takenRows.map((row) => row.code))
    );

    const [created] = await tx
      .insert(locations)
      .values({
        organizationId: command.organizationId,
        name: command.name,
        code,
        timezone: command.timezone,
      })
      .returning({
        id: locations.id,
        name: locations.name,
        timezone: locations.timezone,
        isActive: locations.isActive,
      });

    await appendOutboxEvent(tx, {
      organizationId: command.organizationId,
      locationId: created.id,
      eventName: locationEventName,
      aggregateType: "location",
      aggregateId: created.id,
      idempotencyKey: command.idempotencyKey,
      payload: {
        actorUserId: command.actor.userId,
        actorMemberId: command.actor.memberId,
        commandFingerprint,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: created.id,
      actorUserId: command.actor.userId,
      action: locationEventName,
      targetType: "location",
      targetId: created.id,
      idempotencyKey: command.idempotencyKey,
      after: { name: created.name, timezone: created.timezone, code },
      metadata: {
        commandFingerprint,
        activeLocationsBefore: activeLocations,
        locationLimit,
        planCode: entitlement.planCode,
      },
    });

    return { ...created, replayed: false };
  });
}
