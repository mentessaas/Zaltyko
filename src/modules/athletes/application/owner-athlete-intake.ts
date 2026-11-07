import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { getOrganizationUsage, assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import {
  appendAuditEntry,
  appendOutboxEvent,
  findOutboxEvent,
  lockCommand,
  lockGroupCapacity,
} from "@/modules/shared/infrastructure/transactional-records";

const guidSchema = z.guid().transform((value) => value.toLowerCase());
const commandKeySchema = z.string().trim().min(8).max(150);
const relationshipSchema = z.enum([
  "parent",
  "legal_guardian",
  "foster_guardian",
  "other",
]);
const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "));

const familyInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("new"),
      relationship: relationshipSchema,
      startsOn: z.string().date(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("existing"),
      familyId: guidSchema,
      relationship: relationshipSchema,
      startsOn: z.string().date(),
    })
    .strict(),
]);

export const ownerAthleteIntakePayloadSchema = z
  .object({
    organizationId: guidSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    family: familyInputSchema,
  })
  .strict();

export const assignOwnerAthleteIntakePayloadSchema = z
  .object({
    organizationId: guidSchema,
    groupId: guidSchema,
    startsOn: z.string().date(),
  })
  .strict();

const actorSchema = operationalActorSchema.strict();
const intakeCommandSchema = ownerAthleteIntakePayloadSchema
  .extend({
    userId: guidSchema,
    idempotencyKey: commandKeySchema,
    actor: actorSchema,
  })
  .strict();
const assignCommandSchema = assignOwnerAthleteIntakePayloadSchema
  .extend({
    userId: guidSchema,
    athleteId: guidSchema,
    idempotencyKey: commandKeySchema,
    actor: actorSchema,
  })
  .strict();
const listInputSchema = z
  .object({
    organizationId: guidSchema,
    userId: guidSchema,
    actor: actorSchema,
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: z.number().int().min(1).max(200).default(50),
  })
  .strict();

const intakeReceiptSchema = z
  .object({
    athleteId: guidSchema,
    personId: guidSchema,
    familyId: guidSchema,
    familyMemberId: guidSchema,
    relationship: relationshipSchema,
    startsOn: z.string().date(),
    actorMemberId: guidSchema,
    commandFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

const intakeEventName = "athlete.intake_created";
const assignmentEventName = "group.membership_added";
const ownerRoles = ["owner", "admin"] as const;
const openMembershipStatuses = ["pending", "active", "paused"] as const;

type IntakeInput = z.infer<typeof intakeCommandSchema>;
type AssignInput = z.infer<typeof assignCommandSchema>;
type Actor = z.infer<typeof actorSchema>;

export type OwnerAthleteIntakeCreated = {
  athleteId: string;
  familyId: string;
  incompleteFamily: boolean;
  replayed: boolean;
};

export type OwnerAthleteIntakeListItem = {
  athleteId: string;
  givenName: string;
  familyName: string;
  familySummaries: Array<{
    familyId: string;
    relationship: z.infer<typeof relationshipSchema>;
    startsOn: string;
    incompleteFamily: boolean;
  }>;
  incompleteFamily: boolean;
};

export type OwnerAthleteIntakeGroup = {
  groupId: string;
  groupName: string;
  locationId: string;
  locationName: string;
  capacity: number | null;
  occupancy: number;
  availablePlaces: number | null;
};

export type OwnerAthleteIntakePage = {
  items: OwnerAthleteIntakeListItem[];
  eligibleGroups: OwnerAthleteIntakeGroup[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type OwnerAthleteIntakeAssigned = {
  athleteId: string;
  groupId: string;
  membershipId: string;
  startsOn: string;
  replayed: boolean;
};

function fingerprint(input: IntakeInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        givenName: input.givenName,
        familyName: input.familyName,
        family: input.family,
        actor: input.actor,
      })
    )
    .digest("hex");
}

function assignmentFingerprint(input: AssignInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        athleteId: input.athleteId,
        groupId: input.groupId,
        startsOn: input.startsOn,
        actor: input.actor,
      })
    )
    .digest("hex");
}

async function assertOwnerAdminAllSites(
  tx: TransactionClient,
  input: { organizationId: string; userId: string; actor: Actor }
): Promise<void> {
  if (input.actor.userId !== input.userId) {
    throw new OperationalError(
      "FORBIDDEN",
      "La identidad de la sesión no coincide con el miembro activo",
      403
    );
  }

  const result = await tx.execute(sql`
    select role, location_scope_mode
    from zaltyko.organization_members
    where organization_id = ${input.organizationId}::uuid
      and id = ${input.actor.memberId}::uuid
      and user_id = ${input.userId}::uuid
      and status = 'active'
    for share
  `);
  const row = result.rows[0] as
    | { role: unknown; location_scope_mode: unknown }
    | undefined;
  if (!row || !ownerRoles.includes(row.role as (typeof ownerRoles)[number])) {
    throw new OperationalError(
      "FORBIDDEN",
      "La bandeja organizativa requiere un Owner o Admin activo",
      403
    );
  }
  if (row.location_scope_mode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "La bandeja requiere acceso a todas las sedes de la academia",
      403
    );
  }
}

function parseJsonArray<T>(
  value: unknown,
  schema: z.ZodType<T>,
  description: string
): T[] {
  let decoded = value;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        `No se pudo leer ${description}`,
        503
      );
    }
  }
  const parsed = z.array(schema).safeParse(decoded);
  if (!parsed.success) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      `No se pudo validar ${description}`,
      503
    );
  }
  return parsed.data;
}

const listItemSchema: z.ZodType<OwnerAthleteIntakeListItem> = z
  .object({
    athleteId: z.guid(),
    givenName: z.string(),
    familyName: z.string(),
    familySummaries: z.array(
      z.object({
        familyId: z.guid(),
        relationship: relationshipSchema,
        startsOn: z.string().date(),
        incompleteFamily: z.boolean(),
      })
    ),
    incompleteFamily: z.boolean(),
  })
  .strict();

const eligibleGroupSchema: z.ZodType<OwnerAthleteIntakeGroup> = z
  .object({
    groupId: z.guid(),
    groupName: z.string(),
    locationId: z.guid(),
    locationName: z.string(),
    capacity: z.number().int().positive().nullable(),
    occupancy: z.number().int().nonnegative(),
    availablePlaces: z.number().int().nonnegative().nullable(),
  })
  .strict();

export async function getOwnerAthleteIntake(
  input: z.input<typeof listInputSchema>
): Promise<OwnerAthleteIntakePage> {
  const command = listInputSchema.parse(input);
  const offset = (command.page - 1) * command.pageSize;

  return db.transaction(async (tx) => {
    await assertOwnerAdminAllSites(tx, command);

    // One statement keeps athlete anchoring, family summaries and group capacity
    // on one PostgreSQL snapshot. No data is read from another organization.
    const result = await tx.execute(sql`
      with authorized_member as (
        select id
        from zaltyko.organization_members
        where organization_id = ${command.organizationId}::uuid
          and id = ${command.actor.memberId}::uuid
          and user_id = ${command.userId}::uuid
          and status = 'active'
          and role in ('owner', 'admin')
          and location_scope_mode = 'all'
      ),
      unassigned as materialized (
        select athlete.id as athlete_id,
               athlete.person_id,
               person.given_name,
               person.family_name
        from zaltyko.athletes as athlete
        join zaltyko.people as person
          on person.organization_id = athlete.organization_id
         and person.id = athlete.person_id
        where athlete.organization_id = ${command.organizationId}::uuid
          and athlete.is_active = true
          and not exists (
            select 1 from zaltyko.group_memberships as membership
            where membership.organization_id = athlete.organization_id
              and membership.athlete_id = athlete.id
          )
          and not exists (
            select 1 from zaltyko.enrollments as enrollment
            where enrollment.organization_id = athlete.organization_id
              and enrollment.athlete_id = athlete.id
          )
          and not exists (
            select 1 from zaltyko.attendance_records as attendance
            where attendance.organization_id = athlete.organization_id
              and attendance.athlete_id = athlete.id
          )
          and not exists (
            select 1 from zaltyko.trials as trial
            where trial.organization_id = athlete.organization_id
              and trial.athlete_id = athlete.id
          )
          and not exists (
            select 1 from zaltyko.waitlist_entries as entry
            where entry.organization_id = athlete.organization_id
              and entry.athlete_id = athlete.id
          )
      ),
      page_items as (
        select unassigned.athlete_id,
               unassigned.given_name,
               unassigned.family_name,
               coalesce(family_summary.families, '[]'::jsonb) as family_summaries,
               coalesce(family_summary.incomplete, true) as incomplete_family
        from unassigned
        left join lateral (
          select
            jsonb_agg(
              jsonb_build_object(
                'familyId', family.id,
                'relationship', family_member.relationship,
                'startsOn', family_member.starts_on::text,
                'incompleteFamily', not (
                  exists (
                    select 1
                    from zaltyko.family_guardians as family_guardian
                    join zaltyko.guardians as guardian
                      on guardian.organization_id = family_guardian.organization_id
                     and guardian.id = family_guardian.guardian_id
                    where family_guardian.organization_id = ${command.organizationId}::uuid
                      and family_guardian.family_id = family.id
                      and family_guardian.is_active = true
                      and guardian.is_active = true
                  )
                  and exists (
                    select 1
                    from zaltyko.family_payers as payer
                    where payer.organization_id = ${command.organizationId}::uuid
                      and payer.family_id = family.id
                      and payer.is_primary = true
                      and payer.starts_on <= current_date
                      and (payer.ends_on is null or payer.ends_on >= current_date)
                  )
                )
              ) order by family_member.starts_on, family.id
            ) as families,
            bool_or(
              not (
                exists (
                  select 1
                  from zaltyko.family_guardians as family_guardian
                  join zaltyko.guardians as guardian
                    on guardian.organization_id = family_guardian.organization_id
                   and guardian.id = family_guardian.guardian_id
                  where family_guardian.organization_id = ${command.organizationId}::uuid
                    and family_guardian.family_id = family.id
                    and family_guardian.is_active = true
                    and guardian.is_active = true
                )
                and exists (
                  select 1
                  from zaltyko.family_payers as payer
                  where payer.organization_id = ${command.organizationId}::uuid
                    and payer.family_id = family.id
                    and payer.is_primary = true
                    and payer.starts_on <= current_date
                    and (payer.ends_on is null or payer.ends_on >= current_date)
                )
              )
            ) as incomplete
          from zaltyko.family_members as family_member
          join zaltyko.families as family
            on family.organization_id = family_member.organization_id
           and family.id = family_member.family_id
          where family_member.organization_id = ${command.organizationId}::uuid
            and family_member.athlete_id = unassigned.athlete_id
            and family_member.ends_on is null
            and family.is_active = true
        ) as family_summary on true
        order by unassigned.family_name, unassigned.given_name, unassigned.athlete_id
        limit ${command.pageSize} offset ${offset}
      ),
      candidate_groups as (
        select academy_group.id as group_id,
               academy_group.name as group_name,
               academy_group.location_id,
               location.name as location_name,
               academy_group.capacity,
               (
                 select count(*)::int
                 from zaltyko.group_memberships as membership
                 where membership.organization_id = academy_group.organization_id
                   and membership.group_id = academy_group.id
                   and membership.status in ('pending', 'active', 'paused')
               ) as occupancy
        from zaltyko.groups as academy_group
        join zaltyko.locations as location
          on location.organization_id = academy_group.organization_id
         and location.id = academy_group.location_id
        where academy_group.organization_id = ${command.organizationId}::uuid
          and academy_group.status = 'active'
          and location.is_active = true
      ),
      eligible_groups as (
        select candidate_groups.*,
               case when candidate_groups.capacity is null then null
                    else candidate_groups.capacity - candidate_groups.occupancy
               end as available_places
        from candidate_groups
        where candidate_groups.capacity is null
           or candidate_groups.occupancy < candidate_groups.capacity
      )
      select
        (select count(*)::text from unassigned) as total,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'athleteId', athlete_id,
            'givenName', given_name,
            'familyName', family_name,
            'familySummaries', family_summaries,
            'incompleteFamily', incomplete_family
          ) order by family_name, given_name, athlete_id)
          from page_items
        ), '[]'::jsonb) as items,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'groupId', group_id,
            'groupName', group_name,
            'locationId', location_id,
            'locationName', location_name,
            'capacity', capacity,
            'occupancy', occupancy,
            'availablePlaces', available_places
          ) order by location_name, group_name, group_id)
          from eligible_groups
        ), '[]'::jsonb) as eligible_groups
      from authorized_member
      limit 1
    `);

    const row = result.rows[0] as
      | { total: unknown; items: unknown; eligible_groups: unknown }
      | undefined;
    if (!row) {
      throw new OperationalError(
        "FORBIDDEN",
        "El miembro ya no tiene acceso organizativo",
        403
      );
    }
    if (typeof row.total !== "string" || !/^\d+$/u.test(row.total)) {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "No se pudo comprobar la bandeja organizativa",
        503
      );
    }
    const total = Number(row.total);
    if (!Number.isSafeInteger(total)) {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "El total de la bandeja no es válido",
        503
      );
    }
    const items = parseJsonArray(row.items, listItemSchema, "las fichas sin asignar");
    const eligibleGroups = parseJsonArray(
      row.eligible_groups,
      eligibleGroupSchema,
      "los grupos disponibles"
    );
    return {
      items,
      eligibleGroups,
      total,
      page: command.page,
      pageSize: command.pageSize,
      hasMore: offset + items.length < total,
    };
  });
}

async function assertUnusedIdempotencyKey(
  tx: TransactionClient,
  input: { organizationId: string; idempotencyKey: string }
): Promise<void> {
  const result = await tx.execute(sql`
    select
      exists (
        select 1 from zaltyko.audit_log
        where organization_id = ${input.organizationId}::uuid
          and idempotency_key = ${input.idempotencyKey}
      ) as audit_used,
      exists (
        select 1 from zaltyko.outbox_events
        where organization_id = ${input.organizationId}::uuid
          and idempotency_key = ${input.idempotencyKey}
      ) as event_used
  `);
  const row = result.rows[0] as
    | { audit_used: unknown; event_used: unknown }
    | undefined;
  if (!row || row.audit_used !== false || row.event_used !== false) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya se utilizó en otra operación",
      409
    );
  }
}

async function loadIntakeReplay(
  tx: TransactionClient,
  event: NonNullable<Awaited<ReturnType<typeof findOutboxEvent>>>,
  input: IntakeInput
): Promise<OwnerAthleteIntakeCreated> {
  const receipt = intakeReceiptSchema.safeParse(event.payload);
  const expectedFingerprint = fingerprint(input);
  if (
    event.eventVersion !== 1 ||
    event.aggregateType !== "athlete" ||
    !receipt.success ||
    event.aggregateId !== receipt.data.athleteId ||
    receipt.data.actorMemberId !== input.actor.memberId ||
    receipt.data.commandFingerprint !== expectedFingerprint ||
    receipt.data.relationship !== input.family.relationship ||
    receipt.data.startsOn !== input.family.startsOn ||
    (input.family.kind === "existing" && receipt.data.familyId !== input.family.familyId)
  ) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "La clave ya se utilizó con otra solicitud o ficha",
      409
    );
  }

  const result = await tx.execute(sql`
    select
      athlete.id as athlete_id,
      family_member.family_id,
      family_member.id as family_member_id,
      (
        not family.is_active
        or not exists (
          select 1
          from zaltyko.family_guardians as family_guardian
          join zaltyko.guardians as guardian
            on guardian.organization_id = family_guardian.organization_id
           and guardian.id = family_guardian.guardian_id
          where family_guardian.organization_id = ${input.organizationId}::uuid
            and family_guardian.family_id = family.id
            and family_guardian.is_active = true
            and guardian.is_active = true
        )
        or not exists (
          select 1 from zaltyko.family_payers as payer
          where payer.organization_id = ${input.organizationId}::uuid
            and payer.family_id = family.id
            and payer.is_primary = true
            and payer.starts_on <= current_date
            and (payer.ends_on is null or payer.ends_on >= current_date)
        )
      ) as incomplete_family
    from zaltyko.athletes as athlete
    join zaltyko.people as person
      on person.organization_id = athlete.organization_id
     and person.id = athlete.person_id
    join zaltyko.family_members as family_member
      on family_member.organization_id = athlete.organization_id
     and family_member.athlete_id = athlete.id
     and family_member.id = ${receipt.data.familyMemberId}::uuid
     and family_member.family_id = ${receipt.data.familyId}::uuid
    join zaltyko.families as family
      on family.organization_id = family_member.organization_id
     and family.id = family_member.family_id
    where athlete.organization_id = ${input.organizationId}::uuid
      and athlete.id = ${receipt.data.athleteId}::uuid
      and athlete.person_id = ${receipt.data.personId}::uuid
      and person.id = ${receipt.data.personId}::uuid
    limit 1
  `);
  const row = result.rows[0] as
    | { athlete_id: unknown; family_id: unknown; family_member_id: unknown; incomplete_family: unknown }
    | undefined;
  if (
    !row ||
    row.athlete_id !== receipt.data.athleteId ||
    row.family_id !== receipt.data.familyId ||
    row.family_member_id !== receipt.data.familyMemberId ||
    typeof row.incomplete_family !== "boolean"
  ) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "El recibo del alta ya no coincide con los registros actuales",
      409
    );
  }
  return {
    athleteId: receipt.data.athleteId,
    familyId: receipt.data.familyId,
    incompleteFamily: row.incomplete_family,
    replayed: true,
  };
}

export async function createOwnerAthleteIntake(
  command: z.input<typeof intakeCommandSchema>
): Promise<OwnerAthleteIntakeCreated> {
  const input = intakeCommandSchema.parse(command);
  const commandFingerprint = fingerprint(input);

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await assertOwnerAdminAllSites(tx, input);

    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: intakeEventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) return loadIntakeReplay(tx, prior, input);

    await assertUnusedIdempotencyKey(tx, input);
    await assertOrganizationOperationalWritable(tx, input.organizationId);
    const usage = await getOrganizationUsage(tx, input.organizationId);
    const athleteUsage = usage.resources.find((resource) => resource.resource === "athletes");
    if (!athleteUsage) {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "No se pudo comprobar el límite de gimnastas",
        503
      );
    }
    if (athleteUsage.limit !== null && athleteUsage.current >= athleteUsage.limit) {
      throw new OperationalError(
        "CAPACITY_FULL",
        "Has alcanzado el límite de gimnastas de tu plan",
        409,
        { resource: "athletes", current: athleteUsage.current, limit: athleteUsage.limit }
      );
    }

    let familyId: string;
    if (input.family.kind === "new") {
      const result = await tx.execute(sql`
        insert into zaltyko.families (organization_id)
        values (${input.organizationId}::uuid)
        returning id
      `);
      const id = result.rows[0]?.id;
      if (typeof id !== "string") {
        throw new OperationalError(
          "FEATURE_NOT_AVAILABLE",
          "No se pudo crear la familia",
          503
        );
      }
      familyId = id;
    } else {
      const result = await tx.execute(sql`
        select id
        from zaltyko.families
        where organization_id = ${input.organizationId}::uuid
          and id = ${input.family.familyId}::uuid
          and is_active = true
        for update
      `);
      const id = result.rows[0]?.id;
      if (typeof id !== "string") {
        throw new OperationalError("NOT_FOUND", "Familia activa no encontrada", 404);
      }
      familyId = id;
    }

    const personResult = await tx.execute(sql`
      insert into zaltyko.people (
        organization_id, given_name, family_name
      ) values (
        ${input.organizationId}::uuid, ${input.givenName}, ${input.familyName}
      ) returning id
    `);
    const personId = personResult.rows[0]?.id;
    if (typeof personId !== "string") {
      throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo crear la ficha", 503);
    }

    const athleteResult = await tx.execute(sql`
      insert into zaltyko.athletes (organization_id, person_id)
      values (${input.organizationId}::uuid, ${personId}::uuid)
      returning id
    `);
    const athleteId = athleteResult.rows[0]?.id;
    if (typeof athleteId !== "string") {
      throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo crear la ficha", 503);
    }

    const familyMemberResult = await tx.execute(sql`
      select id from zaltyko.family_members
      where organization_id = ${input.organizationId}::uuid
        and athlete_id = ${athleteId}::uuid
        and (ends_on is null or ends_on >= ${input.family.startsOn}::date)
        and family_id <> ${familyId}::uuid
      limit 1
    `);
    if (familyMemberResult.rows.length > 0) {
      throw new OperationalError(
        "FAMILY_MEMBERSHIP_DATE_CONFLICT",
        "La gimnasta ya tiene una relación familiar que se solapa con esta fecha",
        409
      );
    }

    const linkedFamilyMember = await tx.execute(sql`
      insert into zaltyko.family_members (
        organization_id, family_id, athlete_id, relationship, starts_on
      ) values (
        ${input.organizationId}::uuid,
        ${familyId}::uuid,
        ${athleteId}::uuid,
        ${input.family.relationship},
        ${input.family.startsOn}::date
      ) returning id
    `);
    const familyMemberId = linkedFamilyMember.rows[0]?.id;
    if (typeof familyMemberId !== "string") {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "No se pudo vincular la ficha a su familia",
        503
      );
    }

    const incompleteFamily = await isFamilyIncomplete(tx, input.organizationId, familyId);
    const payload = {
      athleteId,
      personId,
      familyId,
      familyMemberId,
      relationship: input.family.relationship,
      startsOn: input.family.startsOn,
      actorMemberId: input.actor.memberId,
      commandFingerprint,
    };
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: null,
      eventName: intakeEventName,
      aggregateType: "athlete",
      aggregateId: athleteId,
      idempotencyKey: input.idempotencyKey,
      payload,
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: null,
      actorUserId: input.userId,
      action: intakeEventName,
      targetType: "athlete",
      targetId: athleteId,
      idempotencyKey: input.idempotencyKey,
      after: {
        athleteId,
        familyId,
        familyMemberId,
        relationship: input.family.relationship,
        startsOn: input.family.startsOn,
      },
    });
    return { athleteId, familyId, incompleteFamily, replayed: false };
  });
}

async function isFamilyIncomplete(
  tx: TransactionClient,
  organizationId: string,
  familyId: string
): Promise<boolean> {
  const result = await tx.execute(sql`
    select (
      not family.is_active
      or not exists (
        select 1
        from zaltyko.family_guardians as family_guardian
        join zaltyko.guardians as guardian
          on guardian.organization_id = family_guardian.organization_id
         and guardian.id = family_guardian.guardian_id
        where family_guardian.organization_id = ${organizationId}::uuid
          and family_guardian.family_id = family.id
          and family_guardian.is_active = true
          and guardian.is_active = true
      )
      or not exists (
        select 1 from zaltyko.family_payers as payer
        where payer.organization_id = ${organizationId}::uuid
          and payer.family_id = family.id
          and payer.is_primary = true
          and payer.starts_on <= current_date
          and (payer.ends_on is null or payer.ends_on >= current_date)
      )
    ) as incomplete
    from zaltyko.families as family
    where family.organization_id = ${organizationId}::uuid
      and family.id = ${familyId}::uuid
    limit 1
  `);
  const incomplete = result.rows[0]?.incomplete;
  if (typeof incomplete !== "boolean") {
    throw new OperationalError("NOT_FOUND", "Familia no encontrada", 404);
  }
  return incomplete;
}

async function lockAthlete(
  tx: TransactionClient,
  organizationId: string,
  athleteId: string
): Promise<{ isActive: boolean }> {
  const result = await tx.execute(sql`
    select athlete.is_active
    from zaltyko.athletes as athlete
    join zaltyko.people as person
      on person.organization_id = athlete.organization_id
     and person.id = athlete.person_id
    where athlete.organization_id = ${organizationId}::uuid
      and athlete.id = ${athleteId}::uuid
    for update of athlete, person
  `);
  const isActive = result.rows[0]?.is_active;
  if (typeof isActive !== "boolean") {
    throw new OperationalError("NOT_FOUND", "Gimnasta no encontrada", 404);
  }
  return { isActive };
}

async function lockGroupAndLocation(
  tx: TransactionClient,
  input: { organizationId: string; groupId: string }
): Promise<{
  groupId: string;
  locationId: string;
  groupStatus: string;
  locationActive: boolean;
  timezone: string;
  localDate: string;
  capacity: number | null;
}> {
  const result = await tx.execute(sql`
    select academy_group.id as group_id,
           academy_group.location_id,
           academy_group.status as group_status,
           academy_group.capacity,
           location.is_active as location_active,
           location.timezone,
           (current_timestamp at time zone location.timezone)::date::text as local_date
    from zaltyko.groups as academy_group
    join zaltyko.locations as location
      on location.organization_id = academy_group.organization_id
     and location.id = academy_group.location_id
    where academy_group.organization_id = ${input.organizationId}::uuid
      and academy_group.id = ${input.groupId}::uuid
    for update of academy_group, location
  `);
  const row = result.rows[0] as
    | {
        group_id: unknown;
        location_id: unknown;
        group_status: unknown;
        location_active: unknown;
        timezone: unknown;
        local_date: unknown;
        capacity: unknown;
      }
    | undefined;
  if (
    !row ||
    typeof row.group_id !== "string" ||
    typeof row.location_id !== "string" ||
    typeof row.group_status !== "string" ||
    typeof row.location_active !== "boolean" ||
    typeof row.timezone !== "string" ||
    typeof row.local_date !== "string"
  ) {
    throw new OperationalError("NOT_FOUND", "Grupo no encontrado", 404);
  }
  const capacity = row.capacity === null ? null : Number(row.capacity);
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1)) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "La capacidad del grupo no es válida", 503);
  }
  return {
    groupId: row.group_id,
    locationId: row.location_id,
    groupStatus: row.group_status,
    locationActive: row.location_active,
    timezone: row.timezone,
    localDate: row.local_date,
    capacity,
  };
}

export function assertFirstAssignmentStartsOnLocalDate(
  startsOn: string,
  localDate: string
): void {
  if (startsOn !== localDate) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "La primera asignación debe comenzar hoy según la fecha local de la sede",
      409
    );
  }
}

async function hasAnyLocationAnchor(
  tx: TransactionClient,
  input: { organizationId: string; athleteId: string }
): Promise<boolean> {
  const result = await tx.execute(sql`
    select (
      exists (select 1 from zaltyko.group_memberships where organization_id = ${input.organizationId}::uuid and athlete_id = ${input.athleteId}::uuid)
      or exists (select 1 from zaltyko.enrollments where organization_id = ${input.organizationId}::uuid and athlete_id = ${input.athleteId}::uuid)
      or exists (select 1 from zaltyko.attendance_records where organization_id = ${input.organizationId}::uuid and athlete_id = ${input.athleteId}::uuid)
      or exists (select 1 from zaltyko.trials where organization_id = ${input.organizationId}::uuid and athlete_id = ${input.athleteId}::uuid)
      or exists (select 1 from zaltyko.waitlist_entries where organization_id = ${input.organizationId}::uuid and athlete_id = ${input.athleteId}::uuid)
    ) as has_anchor
  `);
  const value = result.rows[0]?.has_anchor;
  if (typeof value !== "boolean") {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "No se pudo comprobar la asignación actual de la ficha",
      503
    );
  }
  return value;
}

async function loadAssignmentReplay(
  tx: TransactionClient,
  event: NonNullable<Awaited<ReturnType<typeof findOutboxEvent>>>,
  input: AssignInput
): Promise<OwnerAthleteIntakeAssigned> {
  const payload = z
    .object({
      membershipId: guidSchema,
      groupId: guidSchema,
      athleteId: guidSchema,
      startsOn: z.string().date(),
      status: z.literal("active"),
    })
    .strict()
    .safeParse(event.payload);
  if (
    event.eventVersion !== 1 ||
    event.aggregateType !== "group_membership" ||
    !payload.success ||
    event.aggregateId !== payload.data.membershipId ||
    payload.data.athleteId !== input.athleteId ||
    payload.data.groupId !== input.groupId ||
    payload.data.startsOn !== input.startsOn
  ) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "La clave ya pertenece a otra asignación",
      409
    );
  }

  const result = await tx.execute(sql`
    select membership.id
    from zaltyko.group_memberships as membership
    join zaltyko.group_membership_history as history
      on history.organization_id = membership.organization_id
     and history.membership_id = membership.id
    where membership.organization_id = ${input.organizationId}::uuid
      and membership.id = ${payload.data.membershipId}::uuid
      and membership.athlete_id = ${input.athleteId}::uuid
      and membership.group_id = ${input.groupId}::uuid
      and membership.starts_on = ${input.startsOn}::date
      and history.idempotency_key = ${input.idempotencyKey}
      and history.changed_by_member_id = ${input.actor.memberId}::uuid
      and history.from_status is null
      and history.to_status = 'active'
      and history.effective_on = ${input.startsOn}::date
    limit 1
  `);
  if (!result.rows[0]) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "El recibo no coincide con el historial de la asignación",
      409
    );
  }
  return {
    athleteId: input.athleteId,
    groupId: input.groupId,
    membershipId: payload.data.membershipId,
    startsOn: input.startsOn,
    replayed: true,
  };
}

export async function assignOwnerAthleteToFirstGroup(
  command: z.input<typeof assignCommandSchema>
): Promise<OwnerAthleteIntakeAssigned> {
  const input = assignCommandSchema.parse(command);

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await assertOwnerAdminAllSites(tx, input);
    const athlete = await lockAthlete(tx, input.organizationId, input.athleteId);
    const group = await lockGroupAndLocation(tx, {
      organizationId: input.organizationId,
      groupId: input.groupId,
    });

    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: assignmentEventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) return loadAssignmentReplay(tx, prior, input);

    await assertUnusedIdempotencyKey(tx, input);
    if (!athlete.isActive) {
      throw new OperationalError("NOT_FOUND", "Gimnasta activa no encontrada", 404);
    }
    if (group.groupStatus !== "active" || !group.locationActive) {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "El grupo y su sede deben estar activos para la primera asignación",
        409
      );
    }
    assertFirstAssignmentStartsOnLocalDate(input.startsOn, group.localDate);

    await assertOrganizationOperationalWritable(tx, input.organizationId);
    if (await hasAnyLocationAnchor(tx, input)) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La ficha ya tiene una asignación o actividad en una sede",
        409
      );
    }

    await lockGroupCapacity(tx, input.organizationId, group.groupId);
    const occupancyResult = await tx.execute(sql`
      select
        count(*)::text as occupancy,
        exists (
          select 1 from zaltyko.group_memberships as existing
          where existing.organization_id = ${input.organizationId}::uuid
            and existing.group_id = ${group.groupId}::uuid
            and existing.athlete_id = ${input.athleteId}::uuid
            and existing.status in ('pending', 'active', 'paused')
        ) as already_member
      from zaltyko.group_memberships as membership
      where membership.organization_id = ${input.organizationId}::uuid
        and membership.group_id = ${group.groupId}::uuid
        and membership.status in ('pending', 'active', 'paused')
    `);
    const occupancyRow = occupancyResult.rows[0] as
      | { occupancy: unknown; already_member: unknown }
      | undefined;
    if (
      !occupancyRow ||
      typeof occupancyRow.occupancy !== "string" ||
      !/^\d+$/u.test(occupancyRow.occupancy) ||
      typeof occupancyRow.already_member !== "boolean"
    ) {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "No se pudo comprobar el cupo del grupo",
        503
      );
    }
    if (occupancyRow.already_member) {
      throw new OperationalError(
        "DUPLICATE_OPEN_GROUP_MEMBERSHIP",
        "La gimnasta ya pertenece a este grupo",
        409
      );
    }
    const occupancy = Number(occupancyRow.occupancy);
    if (!Number.isSafeInteger(occupancy)) {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "La ocupación del grupo no es válida",
        503
      );
    }
    if (group.capacity !== null && occupancy >= group.capacity) {
      throw new OperationalError(
        "GROUP_CAPACITY_FULL",
        "El grupo no tiene plazas disponibles",
        409
      );
    }

    const inserted = await tx.execute(sql`
      insert into zaltyko.group_memberships (
        organization_id, group_id, athlete_id, status, starts_on
      ) values (
        ${input.organizationId}::uuid,
        ${input.groupId}::uuid,
        ${input.athleteId}::uuid,
        'active',
        ${input.startsOn}::date
      ) returning id
    `);
    const membershipId = inserted.rows[0]?.id;
    if (typeof membershipId !== "string") {
      throw new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "No se pudo asignar la ficha al grupo",
        503
      );
    }
    await tx.execute(sql`
      insert into zaltyko.group_membership_history (
        organization_id, membership_id, from_status, to_status,
        changed_by_member_id, idempotency_key, effective_on
      ) values (
        ${input.organizationId}::uuid,
        ${membershipId}::uuid,
        null,
        'active',
        ${input.actor.memberId}::uuid,
        ${input.idempotencyKey},
        ${input.startsOn}::date
      )
    `);

    const payload = {
      membershipId,
      groupId: input.groupId,
      athleteId: input.athleteId,
      startsOn: input.startsOn,
      status: "active",
    };
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      eventName: assignmentEventName,
      aggregateType: "group_membership",
      aggregateId: membershipId,
      idempotencyKey: input.idempotencyKey,
      payload,
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      actorUserId: input.userId,
      action: assignmentEventName,
      targetType: "group_membership",
      targetId: membershipId,
      idempotencyKey: input.idempotencyKey,
      after: payload,
    });

    return {
      athleteId: input.athleteId,
      groupId: input.groupId,
      membershipId,
      startsOn: input.startsOn,
      replayed: false,
    };
  });
}
