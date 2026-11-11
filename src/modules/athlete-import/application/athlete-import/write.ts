/**
 * Writes the creatable rows of an import in bulk, inside the caller's
 * transaction (which already holds the organization and group locks), and
 * records the result as the outbox event that also replays the import.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { TransactionClient } from "@/lib/db-transactions";
import { appendAuditEntry, appendOutboxEvent } from "@/modules/shared/infrastructure/transactional-records";

import type { Relationship } from "../../domain/athlete-import-rows";
import type { Actor, AthleteImportPreviewRow, AthleteImportResult, Classified } from "./model";

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export const ATHLETE_IMPORT_EVENT = "athlete.import_confirmed";

const guidSchema = z.guid().transform((value) => value.toLowerCase());

/** @internal Uso exclusivo de athlete-import/*; la API pública está en athlete-import-service.ts. */
export const importResultPayloadSchema = z
  .object({
    batchId: guidSchema,
    importFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    actorMemberId: guidSchema,
    created: z.array(
      z
        .object({
          row: z.number().int().min(2),
          athleteId: guidSchema,
          familyId: guidSchema,
          membershipId: guidSchema.nullable(),
        })
        .strict()
    ),
    skipped: z.array(z.object({ row: z.number().int().min(2), code: z.string(), message: z.string() }).strict()),
  })
  .strict();

function firstError(preview: AthleteImportPreviewRow): { code: string; message: string } {
  const found = preview.issues.find((entry) => entry.severity === "error");
  return found ? { code: found.code, message: found.message } : { code: "NOT_IMPORTED", message: "No se importó." };
}

/**
 * Inserts families, tutors, contacts, athletes, family links and group
 * memberships for every planned row, then the outbox event and the audit
 * entry. Only identifiers, row numbers and codes leave the tables: no name or
 * contact goes to the event or the audit.
 *
 * @internal Uso exclusivo de athlete-import/*; la API pública está en
 * athlete-import-service.ts.
 */
export async function writeImport(
  tx: TransactionClient,
  input: {
    organizationId: string;
    userId: string;
    actor: Actor;
    idempotencyKey: string;
    previewToken: string;
    today: string;
    classified: readonly Classified[];
  }
): Promise<AthleteImportResult> {
  const plans = input.classified.flatMap((item) => (item.plan ? [item.plan] : []));

  // A new tutor gets the first email and the first phone that any of the
  // sibling rows gives (one primary contact of each kind).
  const tutorContactsByKey = new Map<string, { email: string | null; phone: string | null }>();
  for (const plan of plans) {
    if (plan.existingFamilyId || !plan.row.guardian) continue;
    const known = tutorContactsByKey.get(plan.newFamilyKey) ?? { email: null, phone: null };
    tutorContactsByKey.set(plan.newFamilyKey, {
      email: known.email ?? plan.row.guardian.email,
      phone: known.phone ?? plan.row.guardian.phone,
    });
  }

  const familyIdByKey = new Map<string, string>();
  const newFamilies: Array<{ id: string }> = [];
  const tutorPeople: Array<{ id: string; given_name: string; family_name: string }> = [];
  const tutors: Array<{ id: string; person_id: string }> = [];
  const tutorContacts: Array<{ guardian_id: string; kind: "email" | "phone"; value: string }> = [];
  const familyTutors: Array<{ family_id: string; guardian_id: string; relationship: Relationship }> = [];
  const athletePeople: Array<{ id: string; given_name: string; family_name: string; date_of_birth: string | null }> = [];
  const athletes: Array<{ id: string; person_id: string }> = [];
  const familyMembers: Array<{ family_id: string; athlete_id: string; relationship: Relationship; starts_on: string }> = [];
  const memberships: Array<{ id: string; group_id: string; athlete_id: string; starts_on: string; history_key: string }> = [];
  const created: Array<{ row: number; athleteId: string; familyId: string; membershipId: string | null }> = [];

  for (const plan of plans) {
    let familyId = plan.existingFamilyId;
    if (!familyId) {
      familyId = familyIdByKey.get(plan.newFamilyKey) ?? null;
      if (!familyId) {
        familyId = randomUUID();
        familyIdByKey.set(plan.newFamilyKey, familyId);
        newFamilies.push({ id: familyId });
        const guardian = plan.row.guardian;
        if (guardian) {
          const personId = randomUUID();
          const guardianId = randomUUID();
          tutorPeople.push({ id: personId, given_name: guardian.givenName, family_name: guardian.familyName });
          tutors.push({ id: guardianId, person_id: personId });
          const contacts = tutorContactsByKey.get(plan.newFamilyKey);
          if (contacts?.email) tutorContacts.push({ guardian_id: guardianId, kind: "email", value: contacts.email });
          if (contacts?.phone) tutorContacts.push({ guardian_id: guardianId, kind: "phone", value: contacts.phone });
          familyTutors.push({ family_id: familyId, guardian_id: guardianId, relationship: guardian.relationship });
        }
      }
    }
    const personId = randomUUID();
    const athleteId = randomUUID();
    athletePeople.push({
      id: personId,
      given_name: plan.row.givenName,
      family_name: plan.row.familyName,
      date_of_birth: plan.row.dateOfBirth,
    });
    athletes.push({ id: athleteId, person_id: personId });
    // The family link starts on the civil date of the athlete's site, or of
    // the academy when she has no group.
    const startsOn = plan.group?.localDate ?? input.today;
    familyMembers.push({
      family_id: familyId,
      athlete_id: athleteId,
      relationship: plan.row.guardian?.relationship ?? "parent",
      starts_on: startsOn,
    });
    let membershipId: string | null = null;
    if (plan.group) {
      membershipId = randomUUID();
      memberships.push({
        id: membershipId,
        group_id: plan.group.groupId,
        athlete_id: athleteId,
        starts_on: plan.group.localDate,
        history_key: `${input.idempotencyKey}:row:${plan.row.row}`,
      });
    }
    created.push({ row: plan.row.row, athleteId, familyId, membershipId });
  }

  const org = input.organizationId;
  const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
  if (newFamilies.length > 0) {
    await tx.execute(sql`
      insert into zaltyko.families (id, organization_id)
      select item.id, ${org}::uuid from jsonb_to_recordset(${json(newFamilies)}) as item(id uuid)
    `);
  }
  if (tutors.length > 0) {
    await tx.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      select item.id, ${org}::uuid, item.given_name, item.family_name
      from jsonb_to_recordset(${json(tutorPeople)}) as item(id uuid, given_name text, family_name text)
    `);
    await tx.execute(sql`
      insert into zaltyko.guardians (id, organization_id, person_id)
      select item.id, ${org}::uuid, item.person_id
      from jsonb_to_recordset(${json(tutors)}) as item(id uuid, person_id uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.family_guardians (organization_id, family_id, guardian_id, relationship)
      select ${org}::uuid, item.family_id, item.guardian_id, item.relationship::zaltyko.family_relationship
      from jsonb_to_recordset(${json(familyTutors)}) as item(family_id uuid, guardian_id uuid, relationship text)
    `);
  }
  if (tutorContacts.length > 0) {
    await tx.execute(sql`
      insert into zaltyko.guardian_contacts (organization_id, guardian_id, kind, value, normalized_value, is_primary)
      select ${org}::uuid, item.guardian_id, item.kind::zaltyko.guardian_contact_kind, item.value, item.value, true
      from jsonb_to_recordset(${json(tutorContacts)}) as item(guardian_id uuid, kind text, value text)
    `);
  }
  if (athletes.length > 0) {
    await tx.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name, date_of_birth)
      select item.id, ${org}::uuid, item.given_name, item.family_name, item.date_of_birth
      from jsonb_to_recordset(${json(athletePeople)})
        as item(id uuid, given_name text, family_name text, date_of_birth date)
    `);
    await tx.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      select item.id, ${org}::uuid, item.person_id
      from jsonb_to_recordset(${json(athletes)}) as item(id uuid, person_id uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.family_members (organization_id, family_id, athlete_id, relationship, starts_on)
      select ${org}::uuid, item.family_id, item.athlete_id,
             item.relationship::zaltyko.family_relationship, item.starts_on
      from jsonb_to_recordset(${json(familyMembers)})
        as item(family_id uuid, athlete_id uuid, relationship text, starts_on date)
    `);
  }
  if (memberships.length > 0) {
    await tx.execute(sql`
      insert into zaltyko.group_memberships (id, organization_id, group_id, athlete_id, status, starts_on)
      select item.id, ${org}::uuid, item.group_id, item.athlete_id, 'active', item.starts_on
      from jsonb_to_recordset(${json(memberships)})
        as item(id uuid, group_id uuid, athlete_id uuid, starts_on date)
    `);
    await tx.execute(sql`
      insert into zaltyko.group_membership_history (
        organization_id, membership_id, from_status, to_status,
        changed_by_member_id, idempotency_key, effective_on
      )
      select ${org}::uuid, item.id, null, 'active', ${input.actor.memberId}::uuid,
             item.history_key, item.starts_on
      from jsonb_to_recordset(${json(memberships)}) as item(id uuid, history_key text, starts_on date)
    `);
  }

  const skipped = input.classified
    .filter((item) => !item.plan)
    .map((item) => ({ row: item.preview.row, ...firstError(item.preview) }));
  const batchId = randomUUID();
  await appendOutboxEvent(tx, {
    organizationId: org,
    locationId: null,
    eventName: ATHLETE_IMPORT_EVENT,
    aggregateType: "athlete_import",
    aggregateId: batchId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      batchId,
      importFingerprint: input.previewToken,
      actorMemberId: input.actor.memberId,
      created,
      skipped,
    },
  });
  await appendAuditEntry(tx, {
    organizationId: org,
    locationId: null,
    actorUserId: input.userId,
    action: ATHLETE_IMPORT_EVENT,
    targetType: "athlete_import",
    targetId: batchId,
    idempotencyKey: input.idempotencyKey,
    after: {
      createdCount: created.length,
      skippedCount: skipped.length,
      familyCount: newFamilies.length,
      tutorCount: tutors.length,
      athleteIds: created.map((item) => item.athleteId),
      // The Owner ticked «Declaro que tengo base legal…» before confirming.
      legalBasisConfirmed: true,
    },
  });
  return { batchId, created, skipped, replayed: false };
}
