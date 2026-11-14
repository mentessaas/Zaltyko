import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  createOwnerStaffProfileSchema,
  decodeStaffProfileCursor,
  encodeStaffProfileCursor,
  listOwnerStaffProfilesSchema,
  normalizeStaffName,
  setOwnerStaffProfileActiveSchema,
  staffProfileIdempotencyKeySchema,
  staffProfileVersionSchema,
  updateOwnerStaffProfileSchema,
  type StaffProfileStatusFilter,
} from "@/modules/staff/application/staff-profile-contract";
import type { OperationalActor } from "@/modules/shared/application/actor";

const eventName = "staff.profile_command_recorded";
const timestampFormat = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);

type ProfileRow = {
  organization_id: string;
  staff_profile_id: string;
  person_id: string;
  given_name: string;
  family_name: string;
  preferred_name: string | null;
  is_active: boolean;
  person_updated_at: string;
  staff_updated_at: string;
};

export type OwnerStaffProfile = {
  id: string;
  givenName: string;
  familyName: string;
  preferredName: string | null;
  isActive: boolean;
  version: string;
};

export type OwnerStaffPage = {
  items: OwnerStaffProfile[];
  nextCursor: string | null;
};

export type StaffMutationReceipt = {
  staffProfileId: string;
  version: string;
  isActive: boolean;
};

export type StaffMutationResult = {
  receipt: StaffMutationReceipt;
  replayed: boolean;
};

type StaffActor = { actor: OperationalActor };

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function versionFor(row: ProfileRow): string {
  const canonical = JSON.stringify([
    row.organization_id,
    row.staff_profile_id,
    row.person_id,
    row.given_name,
    row.family_name,
    row.preferred_name,
    row.is_active,
    row.person_updated_at,
    row.staff_updated_at,
  ]);
  return `v1_${digest(canonical)}`;
}

function toProfile(row: ProfileRow): OwnerStaffProfile {
  return {
    id: row.staff_profile_id,
    givenName: row.given_name,
    familyName: row.family_name,
    preferredName: row.preferred_name,
    isActive: row.is_active,
    version: versionFor(row),
  };
}

function commandKey(value: string): string {
  return `staff_${digest(value)}`;
}

function commandFingerprint(value: unknown): string {
  return digest(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function assertOwnerAllAccess(
  tx: TransactionClient,
  organizationId: string,
  actor: OperationalActor,
  intent?: "write"
): Promise<void> {
  const member = await assertOperationalAccess(tx, {
    organizationId,
    // Staff profiles are organization-level. Passing the organization UUID
    // allows the shared helper's all-sites branch and denies selected scopes.
    locationId: organizationId,
    actor,
    allowedRoles: ["owner"],
    ...(intent ? { intent } : {}),
  });
  if (member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Solo la dirección con acceso a toda la academia puede gestionar estas fichas",
      403
    );
  }
}

async function readProfile(
  tx: TransactionClient,
  organizationId: string,
  staffProfileId: string,
  forUpdate: boolean
): Promise<ProfileRow> {
  const lockClause = forUpdate ? sql`for update of staff, person` : sql``;
  const result = await tx.execute(sql<ProfileRow>`
    select
      staff.organization_id::text as organization_id,
      staff.id::text as staff_profile_id,
      person.id::text as person_id,
      person.given_name,
      person.family_name,
      person.preferred_name,
      staff.is_active,
      to_char(person.updated_at at time zone 'UTC', ${timestampFormat}) as person_updated_at,
      to_char(staff.updated_at at time zone 'UTC', ${timestampFormat}) as staff_updated_at
    from zaltyko.staff_profiles as staff
    inner join zaltyko.people as person
      on person.organization_id = staff.organization_id
     and person.id = staff.person_id
    where staff.organization_id = ${organizationId}::uuid
      and staff.id = ${staffProfileId}::uuid
      and staff.member_id is null
    ${lockClause}
  `);
  const row = result.rows[0] as unknown as ProfileRow | undefined;
  if (!row) {
    throw new OperationalError("NOT_FOUND", "Perfil de staff no encontrado", 404);
  }
  return row;
}

async function findPriorReceipt(
  tx: TransactionClient,
  input: {
    organizationId: string;
    idempotencyKey: string;
    commandHash: string;
    operation: string;
  }
): Promise<StaffMutationResult | null> {
  const prior = await findOutboxEvent(tx, {
    organizationId: input.organizationId,
    eventName,
    idempotencyKey: input.idempotencyKey,
  });
  if (!prior) return null;

  const payload = isRecord(prior.payload) ? prior.payload : {};
  assertIdempotencyPayload(payload, {
    commandHash: input.commandHash,
    operation: input.operation,
  });
  const staffProfileId = payload.staffProfileId;
  const version = staffProfileVersionSchema.safeParse(payload.version);
  const isActive = payload.isActive;
  if (
    prior.aggregateType !== "staff_profile" ||
    typeof staffProfileId !== "string" ||
    prior.aggregateId !== staffProfileId ||
    !version.success ||
    typeof isActive !== "boolean"
  ) {
    throw new Error("Stored staff command receipt is invalid");
  }
  return {
    receipt: { staffProfileId, version: version.data, isActive },
    replayed: true,
  };
}

async function appendCommandRecords(
  tx: TransactionClient,
  input: {
    organizationId: string;
    actor: OperationalActor;
    idempotencyKey: string;
    operation: string;
    commandHash: string;
    receipt: StaffMutationReceipt;
  }
): Promise<void> {
  const payload = {
    operation: input.operation,
    commandHash: input.commandHash,
    staffProfileId: input.receipt.staffProfileId,
    version: input.receipt.version,
    isActive: input.receipt.isActive,
  };
  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: null,
    eventName,
    aggregateType: "staff_profile",
    aggregateId: input.receipt.staffProfileId,
    idempotencyKey: input.idempotencyKey,
    payload,
  });
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: null,
    actorUserId: input.actor.userId,
    action: eventName,
    targetType: "staff_profile",
    targetId: input.receipt.staffProfileId,
    idempotencyKey: input.idempotencyKey,
    after: {
      operation: input.operation,
      commandHash: input.commandHash,
      version: input.receipt.version,
      isActive: input.receipt.isActive,
    },
  });
}

async function runMutation(
  input: {
    organizationId: string;
    actor: OperationalActor;
    idempotencyKey: string;
    operation: string;
    command: Record<string, unknown>;
  },
  apply: (tx: TransactionClient) => Promise<StaffMutationReceipt>
): Promise<StaffMutationResult> {
  const parsedKey = staffProfileIdempotencyKeySchema.parse(input.idempotencyKey);
  const persistedKey = commandKey(parsedKey);
  const commandHash = commandFingerprint({
    operation: input.operation,
    organizationId: input.organizationId,
    ...input.command,
  });

  return db.transaction(async (tx) => {
    await assertOwnerAllAccess(tx, input.organizationId, input.actor);
    await lockCommand(tx, input.organizationId, persistedKey);
    await assertOwnerAllAccess(tx, input.organizationId, input.actor);

    const prior = await findPriorReceipt(tx, {
      organizationId: input.organizationId,
      idempotencyKey: persistedKey,
      commandHash,
      operation: input.operation,
    });
    if (prior) return prior;

    await assertOwnerAllAccess(tx, input.organizationId, input.actor, "write");
    const receipt = await apply(tx);
    await appendCommandRecords(tx, {
      organizationId: input.organizationId,
      actor: input.actor,
      idempotencyKey: persistedKey,
      operation: input.operation,
      commandHash,
      receipt,
    });
    return { receipt, replayed: false };
  });
}

export async function listOwnerStaffProfiles(
  input: {
    organizationId: string;
    actor: OperationalActor;
    status?: StaffProfileStatusFilter;
    limit?: number;
    cursor?: string;
  }
): Promise<OwnerStaffPage> {
  const parsed = listOwnerStaffProfilesSchema.parse({
    organizationId: input.organizationId,
    status: input.status,
    limit: input.limit === undefined ? undefined : String(input.limit),
    cursor: input.cursor,
  });
  const afterId = parsed.cursor ? decodeStaffProfileCursor(parsed.cursor) : null;
  if (parsed.cursor && !afterId) {
    throw new OperationalError("INVALID_RELATION", "Cursor inválido", 400);
  }
  const limit = parsed.limit ?? 20;
  const status = parsed.status ?? "active";

  return db.transaction(async (tx) => {
    await assertOwnerAllAccess(tx, parsed.organizationId, input.actor);
    const conditions = [
      sql`staff.organization_id = ${parsed.organizationId}::uuid`,
      sql`staff.member_id is null`,
    ];
    if (status === "active") conditions.push(sql`staff.is_active = true`);
    if (status === "archived") conditions.push(sql`staff.is_active = false`);
    if (afterId) conditions.push(sql`staff.id > ${afterId}::uuid`);
    const result = await tx.execute(sql<ProfileRow>`
      select
        staff.organization_id::text as organization_id,
        staff.id::text as staff_profile_id,
        person.id::text as person_id,
        person.given_name,
        person.family_name,
        person.preferred_name,
        staff.is_active,
        to_char(person.updated_at at time zone 'UTC', ${timestampFormat}) as person_updated_at,
        to_char(staff.updated_at at time zone 'UTC', ${timestampFormat}) as staff_updated_at
      from zaltyko.staff_profiles as staff
      inner join zaltyko.people as person
        on person.organization_id = staff.organization_id
       and person.id = staff.person_id
      where ${sql.join(conditions, sql` and `)}
      order by staff.id asc
      limit ${limit + 1}
    `);
    const rows = result.rows as unknown as ProfileRow[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: pageRows.map(toProfile),
      nextCursor: hasMore
        ? encodeStaffProfileCursor(pageRows[pageRows.length - 1]!.staff_profile_id)
        : null,
    };
  });
}

export async function createOwnerStaffProfile(
  input: {
    organizationId: string;
    givenName: string;
    familyName: string;
    preferredName?: string | null;
  } & StaffActor & { idempotencyKey: string }
): Promise<StaffMutationResult> {
  const parsed = createOwnerStaffProfileSchema.parse({
    organizationId: input.organizationId,
    givenName: input.givenName,
    familyName: input.familyName,
    preferredName: input.preferredName,
  });
  const givenName = normalizeStaffName(parsed.givenName);
  const familyName = normalizeStaffName(parsed.familyName);
  const preferredName = parsed.preferredName;

  return runMutation(
    {
      organizationId: parsed.organizationId,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      operation: "create",
      command: { givenName, familyName, preferredName },
    },
    async (tx) => {
      const insertedPerson = await tx.execute(sql<{ id: string }>`
        insert into zaltyko.people (
          organization_id, given_name, family_name, preferred_name, created_at, updated_at
        ) values (
          ${parsed.organizationId}::uuid, ${givenName}, ${familyName}, ${preferredName},
          clock_timestamp(), clock_timestamp()
        ) returning id::text as id
      `);
      const personId = String(insertedPerson.rows[0]?.id ?? "");
      if (!personId) {
        throw new Error("Staff person insert returned no id");
      }
      const insertedProfile = await tx.execute(sql<{ id: string }>`
        insert into zaltyko.staff_profiles (
          organization_id, person_id, member_id, is_active, created_at, updated_at
        ) values (
          ${parsed.organizationId}::uuid, ${personId}::uuid, null, true,
          clock_timestamp(), clock_timestamp()
        ) returning id::text as id
      `);
      const staffProfileId = String(insertedProfile.rows[0]?.id ?? "");
      if (!staffProfileId) {
        throw new Error("Staff profile insert returned no id");
      }
      const row = await readProfile(tx, parsed.organizationId, staffProfileId, false);
      const profile = toProfile(row);
      return {
        staffProfileId: profile.id,
        version: profile.version,
        isActive: profile.isActive,
      };
    }
  );
}

async function assertPersonIsNotShared(
  tx: TransactionClient,
  organizationId: string,
  personId: string
): Promise<void> {
  const result = await tx.execute(sql<{ is_shared: boolean }>`
    select
      exists (
        select 1 from zaltyko.athletes
        where organization_id = ${organizationId}::uuid and person_id = ${personId}::uuid
      ) or exists (
        select 1 from zaltyko.guardians
        where organization_id = ${organizationId}::uuid and person_id = ${personId}::uuid
      ) as is_shared
  `);
  if (result.rows[0]?.is_shared) {
    throw new OperationalError(
      "INVALID_RELATION",
      "No se puede editar el nombre porque esta persona está vinculada a otro perfil",
      409
    );
  }
}

export async function updateOwnerStaffProfile(
  input: {
    organizationId: string;
    staffProfileId: string;
    givenName: string;
    familyName: string;
    preferredName?: string | null;
    version: string;
  } & StaffActor & { idempotencyKey: string }
): Promise<StaffMutationResult> {
  const parsed = updateOwnerStaffProfileSchema.parse({
    organizationId: input.organizationId,
    givenName: input.givenName,
    familyName: input.familyName,
    preferredName: input.preferredName,
    version: input.version,
  });
  const givenName = normalizeStaffName(parsed.givenName);
  const familyName = normalizeStaffName(parsed.familyName);
  const preferredName = parsed.preferredName;

  return runMutation(
    {
      organizationId: parsed.organizationId,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      operation: "update",
      command: {
        staffProfileId: input.staffProfileId,
        givenName,
        familyName,
        preferredName,
        version: parsed.version,
      },
    },
    async (tx) => {
      const current = await readProfile(tx, parsed.organizationId, input.staffProfileId, true);
      if (versionFor(current) !== parsed.version) {
        throw new OperationalError("VERSION_CONFLICT", "El perfil ha cambiado. Recarga e inténtalo de nuevo.", 409);
      }
      await assertPersonIsNotShared(tx, parsed.organizationId, current.person_id);
      await tx.execute(sql`
        update zaltyko.people
        set given_name = ${givenName}, family_name = ${familyName},
            preferred_name = ${preferredName}, updated_at = clock_timestamp()
        where organization_id = ${parsed.organizationId}::uuid and id = ${current.person_id}::uuid
      `);
      await tx.execute(sql`
        update zaltyko.staff_profiles
        set updated_at = clock_timestamp()
        where organization_id = ${parsed.organizationId}::uuid and id = ${input.staffProfileId}::uuid
          and member_id is null
      `);
      const updated = toProfile(await readProfile(tx, parsed.organizationId, input.staffProfileId, false));
      return { staffProfileId: updated.id, version: updated.version, isActive: updated.isActive };
    }
  );
}

async function setProfileActive(
  input: {
    organizationId: string;
    staffProfileId: string;
    version: string;
    isActive: boolean;
    actor: OperationalActor;
    idempotencyKey: string;
  }
): Promise<StaffMutationResult> {
  const parsed = setOwnerStaffProfileActiveSchema.parse({
    organizationId: input.organizationId,
    version: input.version,
  });
  const operation = input.isActive ? "reactivate" : "archive";
  return runMutation(
    {
      organizationId: parsed.organizationId,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      operation,
      command: {
        staffProfileId: input.staffProfileId,
        version: parsed.version,
      },
    },
    async (tx) => {
      const current = await readProfile(tx, parsed.organizationId, input.staffProfileId, true);
      if (versionFor(current) !== parsed.version) {
        throw new OperationalError("VERSION_CONFLICT", "El perfil ha cambiado. Recarga e inténtalo de nuevo.", 409);
      }
      if (current.is_active === input.isActive) {
        throw new OperationalError(
          "INVALID_STATE_TRANSITION",
          input.isActive ? "El perfil ya está activo" : "El perfil ya está archivado",
          409
        );
      }
      await tx.execute(sql`
        update zaltyko.staff_profiles
        set is_active = ${input.isActive}, updated_at = clock_timestamp()
        where organization_id = ${parsed.organizationId}::uuid
          and id = ${input.staffProfileId}::uuid and member_id is null
      `);
      const updated = toProfile(await readProfile(tx, parsed.organizationId, input.staffProfileId, false));
      return { staffProfileId: updated.id, version: updated.version, isActive: updated.isActive };
    }
  );
}

export function archiveOwnerStaffProfile(
  input: {
    organizationId: string;
    staffProfileId: string;
    version: string;
    actor: OperationalActor;
    idempotencyKey: string;
  }
): Promise<StaffMutationResult> {
  return setProfileActive({ ...input, isActive: false });
}

export function reactivateOwnerStaffProfile(
  input: {
    organizationId: string;
    staffProfileId: string;
    version: string;
    actor: OperationalActor;
    idempotencyKey: string;
  }
): Promise<StaffMutationResult> {
  return setProfileActive({ ...input, isActive: true });
}
