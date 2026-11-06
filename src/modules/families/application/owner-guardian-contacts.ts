import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const commandKeySchema = z.string().trim().min(8).max(180);
const idSchema = z.guid();
const versionTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u)
  .refine((value) => Number.isFinite(Date.parse(value)));
const boundedExpectedValueSchema = z.string().min(1).max(254);

const contactScopeSchema = z
  .object({
    organizationId: idSchema,
    locationId: idSchema,
    guardianId: idSchema,
    actor: operationalActorSchema,
  })
  .strict();

const updateContactSchema = contactScopeSchema
  .extend({
    kind: z.enum(["email", "phone"]),
    expectedContactId: idSchema.nullable(),
    expectedValue: boundedExpectedValueSchema.nullable(),
    expectedUpdatedAt: versionTimestampSchema.nullable(),
    value: z.string().trim().min(1).max(254),
    idempotencyKey: commandKeySchema,
  })
  .strict()
  .superRefine((input, context) => {
    const expectedValues = [
      input.expectedContactId,
      input.expectedValue,
      input.expectedUpdatedAt,
    ];
    if (expectedValues.some((value) => value === null) &&
        expectedValues.some((value) => value !== null)) {
      context.addIssue({
        code: "custom",
        path: ["expectedContactId"],
        message: "Los tres campos esperados deben ser nulos o estar completos.",
      });
    }
    const normalized = normalizeOwnerGuardianContact(input.kind, input.value);
    if (!normalized.success) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: normalized.message,
      });
    }
  });

const privilegedRoles = ["owner", "admin", "manager"] as const;
const contactEventName = "guardian.primary_contact_updated";

export type GetOwnerGuardianContactsInput = z.input<typeof contactScopeSchema>;
export type UpdateOwnerGuardianContactInput = z.input<
  typeof updateContactSchema
>;
type ParsedContactScope = z.infer<typeof contactScopeSchema>;
type ParsedContactUpdate = z.infer<typeof updateContactSchema>;

export type OwnerGuardianPrimaryContact = {
  contactId: string;
  value: string;
  verifiedAt: string | null;
  updatedAt: string;
};

export type OwnerGuardianContacts = {
  guardianId: string;
  contacts: {
    email: OwnerGuardianPrimaryContact | null;
    phone: OwnerGuardianPrimaryContact | null;
  };
};

export type UpdatedOwnerGuardianContacts = OwnerGuardianContacts & {
  replayed: boolean;
};

export type NormalizedOwnerGuardianContact =
  | { success: true; value: string; normalizedValue: string }
  | { success: false; message: string };

/**
 * Contact writes do not trigger delivery or verification. Email is normalized
 * for matching; phone numbers must already be explicit E.164 values rather
 * than guessing a country code from an academy or browser locale.
 */
export function normalizeOwnerGuardianContact(
  kind: "email" | "phone",
  value: string
): NormalizedOwnerGuardianContact {
  const trimmed = value.trim();
  if (kind === "email") {
    const normalizedValue = trimmed.toLowerCase();
    if (
      normalizedValue.length > 254 ||
      !z.string().email().safeParse(normalizedValue).success
    ) {
      return { success: false, message: "Indica un correo válido de hasta 254 caracteres." };
    }
    return { success: true, value: normalizedValue, normalizedValue };
  }

  if (!/^\+[1-9]\d{7,14}$/u.test(trimmed)) {
    return {
      success: false,
      message: "Indica el teléfono completo con prefijo internacional en formato E.164.",
    };
  }
  return { success: true, value: trimmed, normalizedValue: trimmed };
}

function commandFingerprint(input: ParsedContactUpdate): string {
  const normalized = normalizeOwnerGuardianContact(input.kind, input.value);
  if (!normalized.success) {
    throw new OperationalError("INVALID_RELATION", normalized.message, 422);
  }
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        locationId: input.locationId,
        guardianId: input.guardianId,
        actor: input.actor,
        kind: input.kind,
        expectedContactId: input.expectedContactId,
        expectedValue: input.expectedValue,
        expectedUpdatedAt: input.expectedUpdatedAt,
        normalizedValue: normalized.normalizedValue,
      })
    )
    .digest("hex");
}

function notFound(): OperationalError {
  return new OperationalError(
    "NOT_FOUND",
    "El tutor no está activo o no está vinculado a esta sede.",
    404
  );
}

function activeAnchorGuardianQuery(input: ParsedContactScope) {
  return sql`
    select guardian.id as guardian_id, guardian.organization_id
    from zaltyko.guardians as guardian
    join zaltyko.family_guardians as family_guardian
      on family_guardian.organization_id = guardian.organization_id
     and family_guardian.guardian_id = guardian.id
     and family_guardian.is_active = true
    join zaltyko.families as family
      on family.organization_id = family_guardian.organization_id
     and family.id = family_guardian.family_id
     and family.is_active = true
    join zaltyko.family_members as family_member
      on family_member.organization_id = family_guardian.organization_id
     and family_member.family_id = family.id
    join zaltyko.athletes as athlete
      on athlete.organization_id = family_member.organization_id
     and athlete.id = family_member.athlete_id
     and athlete.is_active = true
    join zaltyko.locations as anchor
      on anchor.organization_id = guardian.organization_id
     and anchor.id = ${input.locationId}::uuid
     and anchor.is_active = true
    where guardian.organization_id = ${input.organizationId}::uuid
      and guardian.id = ${input.guardianId}::uuid
      and guardian.is_active = true
      and family_member.starts_on <= (now() at time zone anchor.timezone)::date
      and (
        family_member.ends_on is null
        or family_member.ends_on >= (now() at time zone anchor.timezone)::date
      )
      and (
        exists (
          select 1
          from zaltyko.enrollments as enrollment
          where enrollment.organization_id = guardian.organization_id
            and enrollment.athlete_id = athlete.id
            and enrollment.location_id = anchor.id
            and enrollment.status in ('pending', 'active')
            and enrollment.starts_on <= (now() at time zone anchor.timezone)::date
            and (
              enrollment.ends_on is null
              or enrollment.ends_on >= (now() at time zone anchor.timezone)::date
            )
        )
        or exists (
          select 1
          from zaltyko.group_memberships as membership
          join zaltyko.groups as academy_group
            on academy_group.organization_id = membership.organization_id
           and academy_group.id = membership.group_id
           and academy_group.location_id = anchor.id
           and academy_group.status = 'active'
          where membership.organization_id = guardian.organization_id
            and membership.athlete_id = athlete.id
            and membership.status = 'active'
            and membership.starts_on <= (now() at time zone anchor.timezone)::date
            and (
              membership.ends_on is null
              or membership.ends_on >= (now() at time zone anchor.timezone)::date
            )
        )
      )
    limit 1
  `;
}

async function assertAnchorGuardianLink(
  tx: TransactionClient,
  input: ParsedContactScope
): Promise<void> {
  const result = await tx.execute(activeAnchorGuardianQuery(input));
  if (result.rows.length === 0) throw notFound();
}

async function assertOwnerGuardianContactAccess(
  tx: TransactionClient,
  input: ParsedContactScope,
  intent?: "write"
): Promise<void> {
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: privilegedRoles,
    ...(intent ? { intent } : {}),
  });
  if (member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Para gestionar el contacto compartido de un tutor necesitas acceso a todas las sedes de la academia.",
      403
    );
  }
}

async function lockGuardian(
  tx: TransactionClient,
  input: ParsedContactScope
): Promise<void> {
  const result = await tx.execute(sql`
    select guardian.id
    from zaltyko.guardians as guardian
    where guardian.organization_id = ${input.organizationId}::uuid
      and guardian.id = ${input.guardianId}::uuid
      and guardian.is_active = true
    for update of guardian
  `);
  if (result.rows.length === 0) throw notFound();
}

type ContactRow = {
  contact_id: string;
  kind: "email" | "phone";
  value: string;
  normalized_value: string;
  is_primary: boolean;
  verified_at: string | null;
  updated_at: string;
};

async function loadGuardianContacts(
  tx: TransactionClient,
  input: ParsedContactScope,
  lockRows = false
): Promise<ContactRow[]> {
  const result = await tx.execute(sql`
    select
      contact.id as contact_id,
      contact.kind,
      contact.value,
      contact.normalized_value,
      contact.is_primary,
      case when contact.verified_at is null then null else
        to_char(contact.verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      end as verified_at,
      to_char(contact.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
    from zaltyko.guardian_contacts as contact
    join zaltyko.guardians as guardian
      on guardian.organization_id = contact.organization_id
     and guardian.id = contact.guardian_id
     and guardian.is_active = true
    where contact.organization_id = ${input.organizationId}::uuid
      and contact.guardian_id = ${input.guardianId}::uuid
    order by contact.kind, contact.id
    ${lockRows ? sql`for update of contact` : sql``}
  `);
  return result.rows as unknown as ContactRow[];
}

function primaryContacts(
  guardianId: string,
  rows: ContactRow[]
): OwnerGuardianContacts {
  const primaryFor = (kind: "email" | "phone") => {
    const rowsForKind = rows.filter((row) => row.kind === kind && row.is_primary);
    if (rowsForKind.length > 1) {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "No se pudo validar el contacto principal del tutor.",
        503
      );
    }
    const row = rowsForKind[0];
    return row
      ? {
          contactId: row.contact_id,
          value: row.value,
          verifiedAt: row.verified_at,
          updatedAt: row.updated_at,
        }
      : null;
  };
  return {
    guardianId,
    contacts: {
      email: primaryFor("email"),
      phone: primaryFor("phone"),
    },
  };
}

function findPrimary(rows: ContactRow[], kind: "email" | "phone") {
  return rows.find((row) => row.kind === kind && row.is_primary) ?? null;
}

function expectedSnapshotMatches(
  current: ContactRow | null,
  input: ParsedContactUpdate
): boolean {
  if (!current) {
    return (
      input.expectedContactId === null &&
      input.expectedValue === null &&
      input.expectedUpdatedAt === null
    );
  }
  return (
    input.expectedContactId === current.contact_id &&
    input.expectedValue === current.value &&
    input.expectedUpdatedAt === current.updated_at
  );
}

function versionConflict(): OperationalError {
  return new OperationalError(
    "VERSION_CONFLICT",
    "El contacto cambió desde la última lectura. Recarga los datos antes de guardar.",
    409
  );
}

async function getContactsInTransaction(
  tx: TransactionClient,
  input: ParsedContactScope
): Promise<OwnerGuardianContacts> {
  await assertOwnerGuardianContactAccess(tx, input);
  // Check the live family/site link and read primary contacts in one SQL
  // statement snapshot so a concurrent unlink cannot race between authorize
  // and contact retrieval.
  const result = await tx.execute(sql`
    with anchor_guardian as (
      ${activeAnchorGuardianQuery(input)}
    )
    select
      contact.id as contact_id,
      contact.kind,
      contact.value,
      contact.normalized_value,
      contact.is_primary,
      case when contact.verified_at is null then null else
        to_char(contact.verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      end as verified_at,
      to_char(contact.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
    from anchor_guardian as guardian
    left join zaltyko.guardian_contacts as contact
      on contact.organization_id = guardian.organization_id
     and contact.guardian_id = guardian.guardian_id
     and contact.is_primary = true
    order by contact.kind
  `);
  if (result.rows.length === 0) throw notFound();
  const rows = result.rows.filter((row) => row.contact_id !== null) as unknown as ContactRow[];
  return primaryContacts(input.guardianId, rows);
}

export async function getOwnerGuardianContacts(
  input: GetOwnerGuardianContactsInput
): Promise<OwnerGuardianContacts> {
  const parsed = contactScopeSchema.parse(input);
  return db.transaction((tx) => getContactsInTransaction(tx, parsed));
}

export async function updateOwnerGuardianContact(
  command: UpdateOwnerGuardianContactInput
): Promise<UpdatedOwnerGuardianContacts> {
  const parsedCommand = updateContactSchema.safeParse(command);
  if (!parsedCommand.success) {
    throw new OperationalError(
      "INVALID_RELATION",
      "El valor del contacto no es válido.",
      422
    );
  }
  const input = parsedCommand.data;
  const normalized = normalizeOwnerGuardianContact(input.kind, input.value);
  if (!normalized.success) {
    throw new OperationalError("INVALID_RELATION", normalized.message, 422);
  }
  const fingerprint = commandFingerprint(input);
  const scope: ParsedContactScope = {
    organizationId: input.organizationId,
    locationId: input.locationId,
    guardianId: input.guardianId,
    actor: input.actor,
  };

  return db.transaction(async (tx) => {
    // Maintain the shared lock order: organization, idempotency key, then
    // guardian row and its contact rows.
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await assertOwnerGuardianContactAccess(tx, scope);
    await lockGuardian(tx, scope);
    await assertAnchorGuardianLink(tx, scope);
    const rows = await loadGuardianContacts(tx, scope, true);
    const current = findPrimary(rows, input.kind);

    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: contactEventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) {
      if (prior.aggregateId !== input.guardianId) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya pertenece a otro tutor.",
          409
        );
      }
      assertIdempotencyPayload(prior.payload, {
        actorUserId: input.actor.userId,
        actorMemberId: input.actor.memberId,
        commandFingerprint: fingerprint,
      });
      return {
        ...primaryContacts(input.guardianId, rows),
        replayed: true,
      };
    }

    if (!expectedSnapshotMatches(current, input)) throw versionConflict();

    const isSamePrimaryValue =
      current?.normalized_value === normalized.normalizedValue;
    await assertOwnerGuardianContactAccess(tx, scope, "write");

    let changed = false;
    let resultingContactId = current?.contact_id ?? null;
    if (!isSamePrimaryValue) {
      if (current) {
        const demoted = await tx.execute(sql`
          update zaltyko.guardian_contacts as contact
          set is_primary = false,
              updated_at = greatest(clock_timestamp(), contact.updated_at + interval '1 microsecond')
          where organization_id = ${input.organizationId}::uuid
            and guardian_id = ${input.guardianId}::uuid
            and id = ${current.contact_id}::uuid
            and is_primary = true
          returning id
        `);
        if (demoted.rows.length !== 1) throw versionConflict();
      }

      const existingTarget = rows.find(
        (row) =>
          row.kind === input.kind &&
          row.normalized_value === normalized.normalizedValue
      );
      if (existingTarget) {
        const promoted = await tx.execute(sql`
          update zaltyko.guardian_contacts as contact
          set value = ${normalized.value},
              is_primary = true,
              verified_at = null,
              updated_at = greatest(clock_timestamp(), contact.updated_at + interval '1 microsecond')
          where organization_id = ${input.organizationId}::uuid
            and guardian_id = ${input.guardianId}::uuid
            and id = ${existingTarget.contact_id}::uuid
            and kind = ${input.kind}::zaltyko.guardian_contact_kind
          returning id
        `);
        if (promoted.rows.length !== 1) throw versionConflict();
        resultingContactId = existingTarget.contact_id;
      } else {
        const inserted = await tx.execute(sql`
          insert into zaltyko.guardian_contacts (
            organization_id, guardian_id, kind, value, normalized_value,
            is_primary, verified_at
          ) values (
            ${input.organizationId}::uuid,
            ${input.guardianId}::uuid,
            ${input.kind}::zaltyko.guardian_contact_kind,
            ${normalized.value},
            ${normalized.normalizedValue},
            true,
            null
          )
          returning id
        `);
        resultingContactId = String(inserted.rows[0]?.id ?? "");
        if (!resultingContactId) {
          throw new OperationalError(
            "FEATURE_NOT_AVAILABLE",
            "No se pudo guardar el contacto principal.",
            503
          );
        }
      }
      changed = true;
    }

    const afterRows = changed
      ? await loadGuardianContacts(tx, scope)
      : rows;
    const result = primaryContacts(input.guardianId, afterRows);
    const resultingContact = result.contacts[input.kind];
    const occurredAt = new Date();
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: contactEventName,
      aggregateType: "guardian",
      aggregateId: input.guardianId,
      idempotencyKey: input.idempotencyKey,
      occurredAt,
      payload: {
        contactId: resultingContactId,
        actorUserId: input.actor.userId,
        actorMemberId: input.actor.memberId,
        kind: input.kind,
        commandFingerprint: fingerprint,
        changed,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: contactEventName,
      targetType: "guardian",
      targetId: input.guardianId,
      idempotencyKey: input.idempotencyKey,
      before: {
        contactId: current?.contact_id ?? null,
      },
      after: {
        contactId: resultingContact?.contactId ?? null,
        changed,
      },
      metadata: {
        kind: input.kind,
        commandFingerprint: fingerprint,
      },
    });

    return { ...result, replayed: false };
  });
}
