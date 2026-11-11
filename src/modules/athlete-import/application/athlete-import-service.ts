/**
 * Athlete import from Excel or CSV (O4): preview and confirmation.
 *
 * - Preview reads only. It parses the file, maps the columns, validates every
 *   row and checks it against the academy: duplicates, groups, tutors that
 *   already exist and the plan limit. Nothing is written.
 * - Confirmation receives the same file and mapping plus the preview token, and
 *   writes every creatable row in one transaction, under the organization lock
 *   shared with every other athlete creation. Rows that are not creatable are
 *   skipped and reported. The Idempotency-Key replays the stored result.
 *
 * Duplicate criterion (conservative): within the academy, the same given name
 * and family name (compared without case, accents or punctuation) and the same
 * date of birth is the same athlete, archived or not. An academy athlete with
 * no date of birth and the same name also stops the row: better skip a row the
 * Owner can create by hand than create the same girl twice.
 */
import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  assertOrganizationOperationalWritable,
  getOrganizationUsage,
} from "@/modules/saas-billing/application/organization-usage";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  appendAuditEntry,
  appendOutboxEvent,
  findOutboxEvent,
  lockCommand,
  lockGroupCapacity,
} from "@/modules/shared/infrastructure/transactional-records";

import {
  ATHLETE_IMPORT_FIELDS,
  type AthleteImportField,
  type AthleteImportMapping,
  athleteDuplicateKey,
  athleteNameKey,
  deriveImportMapping,
  type ImportIssue,
  mappingProblems,
  nameKey,
  type NormalizedImportRow,
  type Relationship,
  validateImportRow,
} from "../domain/athlete-import-rows";
import { parseAthleteImportFile } from "./athlete-import-file";

export const ATHLETE_IMPORT_EVENT = "athlete.import_confirmed";
const IMPORT_ROLES = ["owner", "admin", "manager"] as const;

const guidSchema = z.guid().transform((value) => value.toLowerCase());
export const athleteImportMappingSchema = z
  .object(
    Object.fromEntries(
      ATHLETE_IMPORT_FIELDS.map((field) => [field, z.number().int().min(0).max(49).nullable()])
    ) as Record<AthleteImportField, z.ZodNullable<z.ZodNumber>>
  )
  .strict();

const baseInputSchema = z
  .object({
    organizationId: guidSchema,
    userId: guidSchema,
    actor: operationalActorSchema.strict(),
    fileBytes: z.instanceof(Uint8Array),
    mapping: athleteImportMappingSchema.nullable().optional(),
  })
  .strict();
const confirmInputSchema = baseInputSchema
  .extend({
    mapping: athleteImportMappingSchema,
    previewToken: z.string().regex(/^[a-f0-9]{64}$/u),
    idempotencyKey: z.string().trim().min(8).max(150),
  })
  .strict();

export type AthleteImportRowStatus = "create" | "error" | "duplicate" | "skipped";

export type AthleteImportPreviewRow = Readonly<{
  row: number;
  status: AthleteImportRowStatus;
  issues: readonly ImportIssue[];
  values: Readonly<{
    givenName: string;
    familyName: string;
    dateOfBirth: string | null;
    group: string | null;
    guardianName: string | null;
    guardianEmail: string | null;
    guardianPhone: string | null;
  }>;
}>;

export type AthleteImportPreview = Readonly<{
  format: "csv" | "xlsx";
  headers: string[];
  mapping: AthleteImportMapping;
  mappingProblems: string[];
  rows: AthleteImportPreviewRow[];
  summary: Readonly<{
    total: number;
    toCreate: number;
    errors: number;
    duplicates: number;
    skipped: number;
    withWarnings: number;
    newFamilies: number;
    newTutors: number;
    groupMemberships: number;
  }>;
  plan: Readonly<{ current: number; limit: number | null; readOnly: boolean }>;
  canConfirm: boolean;
  previewToken: string;
}>;

export type AthleteImportResult = Readonly<{
  batchId: string;
  created: ReadonlyArray<{ row: number; athleteId: string; familyId: string; membershipId: string | null }>;
  skipped: ReadonlyArray<{ row: number; code: string; message: string }>;
  replayed: boolean;
}>;

type Actor = { userId: string; memberId: string };

type Authorization = { allLocations: boolean; locationIds: Set<string> };

type GroupRow = {
  groupId: string;
  name: string;
  locationId: string;
  capacity: number | null;
  occupancy: number;
  localDate: string;
};

type ExistingAthlete = { givenName: string; familyName: string; dateOfBirth: string | null; isActive: boolean };

type ExistingContact = { guardianId: string; kind: "email" | "phone"; value: string; familyIds: string[] };

type ImportContext = {
  today: string;
  groups: GroupRow[];
  athletes: ExistingAthlete[];
  contacts: ExistingContact[];
  usage: { current: number; limit: number | null; readOnly: boolean };
};

/** A creatable row and where it goes. */
type PlannedRow = {
  row: NormalizedImportRow;
  group: GroupRow | null;
  /** Existing family of a tutor already in the academy. */
  existingFamilyId: string | null;
  /** Key of the new family shared by siblings of one new tutor in the file. */
  newFamilyKey: string;
};

type Classified = {
  preview: AthleteImportPreviewRow;
  plan: PlannedRow | null;
};

export function athleteImportPreviewToken(bytes: Uint8Array, mapping: AthleteImportMapping): string {
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const orderedMapping = ATHLETE_IMPORT_FIELDS.map((field) => mapping[field]);
  return createHash("sha256").update(`athlete-import:v1:${fileHash}:${JSON.stringify(orderedMapping)}`).digest("hex");
}

async function authorize(
  tx: TransactionClient,
  input: { organizationId: string; userId: string; actor: Actor },
  lock: boolean
): Promise<Authorization> {
  if (input.actor.userId !== input.userId) {
    throw new OperationalError("FORBIDDEN", "La identidad de la sesión no coincide con el miembro activo", 403);
  }
  const result = await tx.execute(sql`
    select role::text as role, location_scope_mode::text as location_scope_mode
    from zaltyko.organization_members
    where organization_id = ${input.organizationId}::uuid
      and id = ${input.actor.memberId}::uuid
      and user_id = ${input.userId}::uuid
      and status = 'active'
    ${lock ? sql`for share` : sql``}
  `);
  const row = result.rows[0] as { role?: unknown; location_scope_mode?: unknown } | undefined;
  if (!row || !IMPORT_ROLES.includes(row.role as (typeof IMPORT_ROLES)[number])) {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la dirección de la academia (propietaria, administración o coordinación) puede importar gimnastas.",
      403
    );
  }
  if (row.location_scope_mode === "all") return { allLocations: true, locationIds: new Set() };
  const scopes = await tx.execute(sql`
    select location_id::text as location_id
    from zaltyko.member_location_scopes
    where organization_id = ${input.organizationId}::uuid
      and member_id = ${input.actor.memberId}::uuid
  `);
  return {
    allLocations: false,
    locationIds: new Set(scopes.rows.map((scope) => String((scope as { location_id: unknown }).location_id))),
  };
}

function count(value: unknown, what: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", `No se pudo comprobar ${what}`, 503);
  }
  return number;
}

async function loadContext(
  tx: TransactionClient,
  organizationId: string,
  rows: readonly NormalizedImportRow[]
): Promise<ImportContext> {
  const todayResult = await tx.execute(sql`select current_date::text as today`);
  const today = String((todayResult.rows[0] as { today: unknown }).today);

  const groupResult = await tx.execute(sql`
    select academy_group.id::text as group_id,
           academy_group.name,
           academy_group.location_id::text as location_id,
           academy_group.capacity,
           (current_timestamp at time zone location.timezone)::date::text as local_date,
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
    where academy_group.organization_id = ${organizationId}::uuid
      and academy_group.status = 'active'
      and location.is_active = true
    order by academy_group.id
  `);
  const groups = groupResult.rows.map((raw): GroupRow => {
    const row = raw as Record<string, unknown>;
    return {
      groupId: String(row.group_id),
      name: String(row.name),
      locationId: String(row.location_id),
      capacity: row.capacity === null ? null : count(row.capacity, "la capacidad de un grupo"),
      occupancy: count(row.occupancy, "la ocupación de un grupo"),
      localDate: String(row.local_date),
    };
  });

  const dates = [...new Set(rows.map((row) => row.dateOfBirth).filter((date): date is string => date !== null))];
  const athleteResult = await tx.execute(sql`
    select person.given_name, person.family_name,
           person.date_of_birth::text as date_of_birth, athlete.is_active
    from zaltyko.athletes as athlete
    join zaltyko.people as person
      on person.organization_id = athlete.organization_id
     and person.id = athlete.person_id
    where athlete.organization_id = ${organizationId}::uuid
      and (
        person.date_of_birth is null
        or person.date_of_birth in (
          select value::date from jsonb_array_elements_text(${JSON.stringify(dates)}::jsonb)
        )
      )
  `);
  const athletes = athleteResult.rows.map((raw): ExistingAthlete => {
    const row = raw as Record<string, unknown>;
    return {
      givenName: String(row.given_name),
      familyName: String(row.family_name),
      dateOfBirth: row.date_of_birth === null ? null : String(row.date_of_birth),
      isActive: row.is_active === true,
    };
  });

  const emails = [...new Set(rows.flatMap((row) => (row.guardian?.email ? [row.guardian.email] : [])))];
  const phones = [...new Set(rows.flatMap((row) => (row.guardian?.phone ? [row.guardian.phone] : [])))];
  let contacts: ExistingContact[] = [];
  if (emails.length + phones.length > 0) {
    const contactResult = await tx.execute(sql`
      select contact.guardian_id::text as guardian_id,
             contact.kind::text as kind,
             contact.normalized_value,
             coalesce((
               select jsonb_agg(distinct family_guardian.family_id::text)
               from zaltyko.family_guardians as family_guardian
               join zaltyko.families as family
                 on family.organization_id = family_guardian.organization_id
                and family.id = family_guardian.family_id
               where family_guardian.organization_id = contact.organization_id
                 and family_guardian.guardian_id = contact.guardian_id
                 and family_guardian.is_active = true
                 and family.is_active = true
             ), '[]'::jsonb) as family_ids
      from zaltyko.guardian_contacts as contact
      join zaltyko.guardians as guardian
        on guardian.organization_id = contact.organization_id
       and guardian.id = contact.guardian_id
      where contact.organization_id = ${organizationId}::uuid
        and guardian.is_active = true
        and (
          (contact.kind = 'email' and contact.normalized_value in (
            select value from jsonb_array_elements_text(${JSON.stringify(emails)}::jsonb)
          ))
          or (contact.kind = 'phone' and contact.normalized_value in (
            select value from jsonb_array_elements_text(${JSON.stringify(phones)}::jsonb)
          ))
        )
    `);
    contacts = contactResult.rows.map((raw): ExistingContact => {
      const row = raw as Record<string, unknown>;
      const familyIds = Array.isArray(row.family_ids) ? row.family_ids.map(String) : [];
      return {
        guardianId: String(row.guardian_id),
        kind: row.kind === "phone" ? "phone" : "email",
        value: String(row.normalized_value),
        familyIds,
      };
    });
  }

  const usage = await getOrganizationUsage(tx, organizationId);
  const athleteUsage = usage.resources.find((resource) => resource.resource === "athletes");
  if (!athleteUsage) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo comprobar el límite de gimnastas", 503);
  }
  return {
    today,
    groups,
    athletes,
    contacts,
    usage: { current: athleteUsage.current, limit: athleteUsage.limit, readOnly: usage.readOnly },
  };
}

function issue(severity: ImportIssue["severity"], field: AthleteImportField | null, code: string, message: string): ImportIssue {
  return { severity, field, code, message };
}

/**
 * Decides, row by row and in file order, what the import does. Shared by the
 * preview and the confirmation so both always agree.
 */
export function classifyImportRows(
  rows: readonly NormalizedImportRow[],
  context: Omit<ImportContext, "today">,
  authorization: Authorization
): Classified[] {
  const visibleGroups = context.groups.filter(
    (group) => authorization.allLocations || authorization.locationIds.has(group.locationId)
  );
  const groupsByName = new Map<string, GroupRow[]>();
  for (const group of visibleGroups) {
    const key = nameKey(group.name);
    groupsByName.set(key, [...(groupsByName.get(key) ?? []), group]);
  }
  const existingExact = new Map<string, ExistingAthlete>();
  const existingNameWithoutDate = new Set<string>();
  for (const athlete of context.athletes) {
    if (athlete.dateOfBirth === null) existingNameWithoutDate.add(athleteNameKey(athlete));
    else existingExact.set(athleteDuplicateKey(athlete), athlete);
  }
  const contactGuardians = new Map<string, ExistingContact>();
  for (const contact of context.contacts) contactGuardians.set(`${contact.kind}:${contact.value}`, contact);

  const seenInFile = new Map<string, number>();
  const familyKeyByContact = new Map<string, { key: string; row: number }>();
  const takenByGroup = new Map<string, number>();
  const remaining =
    context.usage.limit === null ? Number.POSITIVE_INFINITY : Math.max(0, context.usage.limit - context.usage.current);
  let planned = 0;

  return rows.map((row) => {
    const issues = [...row.issues];
    const values = {
      givenName: row.givenName,
      familyName: row.familyName,
      dateOfBirth: row.dateOfBirth,
      group: row.group,
      guardianName: row.guardian ? `${row.guardian.givenName} ${row.guardian.familyName}`.trim() : null,
      guardianEmail: row.guardian?.email ?? null,
      guardianPhone: row.guardian?.phone ?? null,
    };
    const done = (status: AthleteImportRowStatus, plan: PlannedRow | null = null): Classified => ({
      preview: { row: row.row, status, issues, values },
      plan,
    });

    if (issues.some((item) => item.severity === "error")) return done("error");

    const key = athleteDuplicateKey(row);
    const firstRow = seenInFile.get(key);
    if (firstRow !== undefined) {
      issues.push(
        issue("error", null, "DUPLICATE_IN_FILE", `Repite la gimnasta de la fila ${firstRow} (mismo nombre y fecha de nacimiento).`)
      );
      return done("duplicate");
    }
    seenInFile.set(key, row.row);
    const existing = existingExact.get(key);
    if (existing) {
      issues.push(
        issue(
          "error",
          null,
          "DUPLICATE_EXISTING",
          existing.isActive
            ? "Ya existe en la academia una gimnasta con el mismo nombre y fecha de nacimiento."
            : "Ya existe una gimnasta archivada con el mismo nombre y fecha de nacimiento; reactívala desde su ficha."
        )
      );
      return done("duplicate");
    }
    if (existingNameWithoutDate.has(athleteNameKey(row))) {
      issues.push(
        issue(
          "error",
          null,
          "DUPLICATE_POSSIBLE",
          "Ya existe una gimnasta con este nombre sin fecha de nacimiento. Revisa su ficha antes de importarla."
        )
      );
      return done("duplicate");
    }

    let group: GroupRow | null = null;
    if (row.group) {
      const matches = groupsByName.get(nameKey(row.group)) ?? [];
      if (matches.length === 0) {
        issues.push(issue("error", "group", "GROUP_NOT_FOUND", "No hay ningún grupo activo con ese nombre en tus sedes."));
        return done("error");
      }
      if (matches.length > 1) {
        issues.push(
          issue("error", "group", "GROUP_AMBIGUOUS", "Hay varios grupos activos con ese nombre; renombra uno para distinguirlos.")
        );
        return done("error");
      }
      group = matches[0]!;
    } else if (!authorization.allLocations) {
      issues.push(
        issue("error", "group", "GROUP_REQUIRED", "Con acceso solo a algunas sedes, cada gimnasta debe ir a un grupo de tus sedes.")
      );
      return done("error");
    }

    let existingFamilyId: string | null = null;
    let newFamilyKey = `row:${row.row}`;
    const guardian = row.guardian;
    if (guardian && (guardian.email || guardian.phone)) {
      const byEmail = guardian.email ? contactGuardians.get(`email:${guardian.email}`) : undefined;
      const byPhone = guardian.phone ? contactGuardians.get(`phone:${guardian.phone}`) : undefined;
      if (byEmail && byPhone && byEmail.guardianId !== byPhone.guardianId) {
        issues.push(
          issue("error", "guardianEmail", "GUARDIAN_CONFLICT", "El email y el teléfono del tutor pertenecen a dos tutores distintos de la academia.")
        );
        return done("error");
      }
      const known = byEmail ?? byPhone;
      if (known) {
        if (known.familyIds.length !== 1) {
          issues.push(
            issue(
              "error",
              "guardianEmail",
              "GUARDIAN_FAMILY_UNCLEAR",
              known.familyIds.length === 0
                ? "El tutor ya existe pero no tiene una familia activa; da de alta a esta gimnasta desde Gimnastas."
                : "El tutor ya existe en varias familias; da de alta a esta gimnasta desde Gimnastas para elegir la familia."
            )
          );
          return done("error");
        }
        existingFamilyId = known.familyIds[0]!;
        issues.push(
          issue("warning", "guardianEmail", "GUARDIAN_EXISTING", "El tutor ya está en la academia: la gimnasta se añade a su familia.")
        );
      } else {
        const viaEmail = guardian.email ? familyKeyByContact.get(`email:${guardian.email}`) : undefined;
        const viaPhone = guardian.phone ? familyKeyByContact.get(`phone:${guardian.phone}`) : undefined;
        if (viaEmail && viaPhone && viaEmail.key !== viaPhone.key) {
          issues.push(
            issue(
              "error",
              "guardianEmail",
              "GUARDIAN_CONFLICT_IN_FILE",
              `El email del tutor coincide con la fila ${viaEmail.row} y el teléfono con la fila ${viaPhone.row}.`
            )
          );
          return done("error");
        }
        const sibling = viaEmail ?? viaPhone;
        if (sibling) {
          newFamilyKey = sibling.key;
          issues.push(
            issue("warning", null, "SIBLING", `Comparte tutor con la fila ${sibling.row}: irán a la misma familia.`)
          );
        }
        // Every contact of this tutor points to the family, so a later row
        // with only the other contact joins it too.
        const owner = sibling ?? { key: newFamilyKey, row: row.row };
        if (guardian.email && !viaEmail) familyKeyByContact.set(`email:${guardian.email}`, owner);
        if (guardian.phone && !viaPhone) familyKeyByContact.set(`phone:${guardian.phone}`, owner);
      }
    }

    if (group) {
      const taken = takenByGroup.get(group.groupId) ?? 0;
      if (group.capacity !== null && group.occupancy + taken >= group.capacity) {
        issues.push(issue("error", "group", "GROUP_FULL", "El grupo no tiene plazas libres."));
        return done("skipped");
      }
    }
    if (planned >= remaining) {
      issues.push(
        issue(
          "error",
          null,
          "PLAN_LIMIT",
          `Supera el límite de ${context.usage.limit ?? 0} gimnastas de tu plan. Amplía el plan para importarla.`
        )
      );
      return done("skipped");
    }
    planned += 1;
    if (group) takenByGroup.set(group.groupId, (takenByGroup.get(group.groupId) ?? 0) + 1);
    return done("create", { row, group, existingFamilyId, newFamilyKey });
  });
}

type Evaluation = {
  token: string;
  mapping: AthleteImportMapping;
  preview: AthleteImportPreview;
  classified: Classified[];
  context: ImportContext | null;
};

async function evaluate(
  tx: TransactionClient,
  input: { organizationId: string; fileBytes: Uint8Array; mapping?: AthleteImportMapping | null },
  authorization: Authorization
): Promise<Evaluation> {
  const file = parseAthleteImportFile(input.fileBytes);
  const mapping = input.mapping ?? deriveImportMapping(file.headers);
  const token = athleteImportPreviewToken(input.fileBytes, mapping);
  const problems = mappingProblems(mapping, file.headers.length);
  if (problems.length > 0) {
    return {
      token,
      mapping,
      classified: [],
      context: null,
      preview: {
        format: file.format,
        headers: file.headers,
        mapping,
        mappingProblems: problems,
        rows: [],
        summary: {
          total: file.rows.length,
          toCreate: 0,
          errors: 0,
          duplicates: 0,
          skipped: 0,
          withWarnings: 0,
          newFamilies: 0,
          newTutors: 0,
          groupMemberships: 0,
        },
        plan: { current: 0, limit: null, readOnly: false },
        canConfirm: false,
        previewToken: token,
      },
    };
  }

  // `today` comes from the database; validate dates against it after loading.
  const provisional = file.rows.map((row) => validateImportRow(row.cells, mapping, row.row, "9999-12-31"));
  const context = await loadContext(tx, input.organizationId, provisional);
  const rows = file.rows.map((row) => validateImportRow(row.cells, mapping, row.row, context.today));
  const classified = classifyImportRows(rows, context, authorization);

  const created = classified.flatMap((item) => (item.plan ? [item.plan] : []));
  const newFamilyKeys = new Set(created.filter((plan) => !plan.existingFamilyId).map((plan) => plan.newFamilyKey));
  const newTutorKeys = new Set(
    created
      .filter((plan) => !plan.existingFamilyId && plan.row.guardian)
      .map((plan) => plan.newFamilyKey)
  );
  const statuses = classified.map((item) => item.preview.status);
  const toCreate = created.length;
  return {
    token,
    mapping,
    classified,
    context,
    preview: {
      format: file.format,
      headers: file.headers,
      mapping,
      mappingProblems: [],
      rows: classified.map((item) => item.preview),
      summary: {
        total: classified.length,
        toCreate,
        errors: statuses.filter((status) => status === "error").length,
        duplicates: statuses.filter((status) => status === "duplicate").length,
        skipped: statuses.filter((status) => status === "skipped").length,
        withWarnings: classified.filter(
          (item) => item.preview.status === "create" && item.preview.issues.some((entry) => entry.severity === "warning")
        ).length,
        newFamilies: newFamilyKeys.size,
        newTutors: newTutorKeys.size,
        groupMemberships: created.filter((plan) => plan.group).length,
      },
      plan: context.usage,
      canConfirm: toCreate > 0 && !context.usage.readOnly,
      previewToken: token,
    },
  };
}

export async function previewAthleteImport(
  command: z.input<typeof baseInputSchema>
): Promise<AthleteImportPreview> {
  const input = baseInputSchema.parse(command);
  return db.transaction(async (tx) => {
    const authorization = await authorize(tx, input, false);
    return (await evaluate(tx, input, authorization)).preview;
  });
}

const resultPayloadSchema = z
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
    skipped: z.array(
      z.object({ row: z.number().int().min(2), code: z.string(), message: z.string() }).strict()
    ),
  })
  .strict();

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
  const row = result.rows[0] as { audit_used: unknown; event_used: unknown } | undefined;
  if (!row || row.audit_used !== false || row.event_used !== false) {
    throw new OperationalError("IDEMPOTENCY_CONFLICT", "La clave de idempotencia ya se utilizó en otra operación", 409);
  }
}

function firstError(preview: AthleteImportPreviewRow): { code: string; message: string } {
  const found = preview.issues.find((entry) => entry.severity === "error");
  return found ? { code: found.code, message: found.message } : { code: "NOT_IMPORTED", message: "No se importó." };
}

export async function confirmAthleteImport(
  command: z.input<typeof confirmInputSchema>
): Promise<AthleteImportResult> {
  const input = confirmInputSchema.parse(command);
  if (athleteImportPreviewToken(input.fileBytes, input.mapping) !== input.previewToken) {
    throw new OperationalError(
      "IMPORT_PREVIEW_STALE",
      "El fichero o las columnas no coinciden con la vista previa. Vuelve a generarla antes de importar.",
      409
    );
  }

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const authorization = await authorize(tx, input, true);

    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: ATHLETE_IMPORT_EVENT,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) {
      const payload = resultPayloadSchema.safeParse(prior.payload);
      if (
        !payload.success ||
        payload.data.importFingerprint !== input.previewToken ||
        payload.data.actorMemberId !== input.actor.memberId
      ) {
        throw new OperationalError("IDEMPOTENCY_CONFLICT", "La clave ya se usó para otra importación", 409);
      }
      return {
        batchId: payload.data.batchId,
        created: payload.data.created,
        skipped: payload.data.skipped,
        replayed: true,
      };
    }
    await assertUnusedIdempotencyKey(tx, input);
    // Locks the organization row (shared with every athlete creation) and
    // refuses a read-only academy.
    await assertOrganizationOperationalWritable(tx, input.organizationId);

    // First pass to learn the target groups, lock their capacity in a fixed
    // order, then decide again on fresh reads.
    const firstPass = await evaluate(tx, input, authorization);
    if (firstPass.preview.mappingProblems.length > 0) {
      throw new OperationalError("IMPORT_FILE_INVALID", firstPass.preview.mappingProblems.join(" "), 422, {
        reason: "MAPPING",
      });
    }
    const groupIds = [
      ...new Set(firstPass.classified.flatMap((item) => (item.plan?.group ? [item.plan.group.groupId] : []))),
    ].sort();
    for (const groupId of groupIds) await lockGroupCapacity(tx, input.organizationId, groupId);
    const evaluation = groupIds.length > 0 ? await evaluate(tx, input, authorization) : firstPass;
    const context = evaluation.context!;

    const plans = evaluation.classified.flatMap((item) => (item.plan ? [item.plan] : []));
    const familyIdByKey = new Map<string, string>();
    const newFamilies: Array<{ id: string }> = [];
    const tutorPeople: Array<{ id: string; given_name: string; family_name: string }> = [];
    const tutors: Array<{ id: string; person_id: string }> = [];
    const tutorContacts: Array<{ guardian_id: string; kind: "email" | "phone"; value: string }> = [];
    const familyTutors: Array<{ family_id: string; guardian_id: string; relationship: Relationship }> = [];
    const athletePeople: Array<{ id: string; given_name: string; family_name: string; date_of_birth: string }> = [];
    const athletes: Array<{ id: string; person_id: string }> = [];
    const familyMembers: Array<{ family_id: string; athlete_id: string; relationship: Relationship }> = [];
    const memberships: Array<{ id: string; group_id: string; athlete_id: string; starts_on: string; history_key: string }> = [];
    const created: Array<{ row: number; athleteId: string; familyId: string; membershipId: string | null }> = [];

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
        date_of_birth: plan.row.dateOfBirth!,
      });
      athletes.push({ id: athleteId, person_id: personId });
      familyMembers.push({
        family_id: familyId,
        athlete_id: athleteId,
        relationship: plan.row.guardian?.relationship ?? "parent",
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
    if (tutorPeople.length > 0) {
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
               item.relationship::zaltyko.family_relationship, ${context.today}::date
        from jsonb_to_recordset(${json(familyMembers)})
          as item(family_id uuid, athlete_id uuid, relationship text)
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

    const skipped = evaluation.classified
      .filter((item) => !item.plan)
      .map((item) => ({ row: item.preview.row, ...firstError(item.preview) }));
    const batchId = randomUUID();
    const payload = {
      batchId,
      importFingerprint: input.previewToken,
      actorMemberId: input.actor.memberId,
      created,
      skipped,
    };
    await appendOutboxEvent(tx, {
      organizationId: org,
      locationId: null,
      eventName: ATHLETE_IMPORT_EVENT,
      aggregateType: "athlete_import",
      aggregateId: batchId,
      idempotencyKey: input.idempotencyKey,
      payload,
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
      },
    });
    return { batchId, created, skipped, replayed: false };
  });
}
