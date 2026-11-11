/**
 * O4 · Importación de gimnastas contra PostgreSQL desechable: lo que se
 * escribe, aislamiento entre academias, duplicados, idempotencia, límite del
 * plan, solo lectura y roles. Cada prueba siembra sus propias academias con
 * UUID aleatorios y solo lee filas de ellas. Datos sintéticos.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  athleteImportPreviewToken,
  confirmAthleteImport,
  previewAthleteImport,
} from "@/modules/athlete-import/application/athlete-import-service";
import { deriveImportMapping } from "@/modules/athlete-import/domain/athlete-import-rows";

const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";
const describeDisposablePg = describe.skipIf(!disposablePgEnabled);

function assertDisposableTarget() {
  if (!disposablePgEnabled) {
    throw new Error("This suite is restricted to opt-in disposable GitHub Linux PostgreSQL");
  }
  const connectionString = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(connectionString ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" ||
    parsed.pathname !== "/postgres" ||
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(
      (value) => value !== connectionString
    )
  ) {
    throw new Error("The integration suite refuses an unexpected PostgreSQL identity");
  }
}

const IMPORT_TABLES = [
  "athletes",
  "audit_log",
  "families",
  "family_guardians",
  "family_members",
  "group_membership_history",
  "group_memberships",
  "guardian_contacts",
  "guardians",
  "outbox_events",
  "people",
] as const;

type Fixture = {
  organizationId: string;
  userId: string;
  memberId: string;
  locationId: string;
  otherLocationId: string;
  groupId: string;
  actor: { userId: string; memberId: string };
};

async function seed(options: {
  role?: "owner" | "admin" | "manager" | "coach";
  locationScopeMode?: "all" | "selected";
  athleteCount?: number;
  groupCapacity?: number | null;
} = {}): Promise<Fixture> {
  assertDisposableTarget();
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationId = randomUUID();
  const otherLocationId = randomUUID();
  const groupId = randomUUID();
  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-athlete-import-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI athlete import ${organizationId}`}, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
    values
      (${locationId}::uuid, ${organizationId}::uuid, ${`ci-imp-${organizationId.slice(0, 8)}`},
        'CI import site', 'Europe/Madrid', true),
      (${otherLocationId}::uuid, ${organizationId}::uuid, ${`ci-imp2-${organizationId.slice(0, 8)}`},
        'CI import other site', 'Europe/Madrid', true)
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid,
      ${options.role ?? "owner"}, 'active', ${options.locationScopeMode ?? "all"}
    )
  `);
  if (options.locationScopeMode === "selected") {
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (organization_id, member_id, location_id)
      values (${organizationId}::uuid, ${memberId}::uuid, ${locationId}::uuid)
    `);
  }
  await db.execute(sql`
    insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status)
    values
      (${groupId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, 'Iniciación CI',
        ${options.groupCapacity === undefined ? 10 : options.groupCapacity}, 'active'),
      (${randomUUID()}::uuid, ${organizationId}::uuid, ${otherLocationId}::uuid, 'Otra sede CI', 10, 'active')
  `);
  const athleteCount = options.athleteCount ?? 0;
  if (athleteCount > 0) {
    await db.execute(sql`
      with seeded as (
        select gen_random_uuid() as person_id, n
        from generate_series(1, ${athleteCount}) as n
      ), people as (
        insert into zaltyko.people (id, organization_id, given_name, family_name)
        select person_id, ${organizationId}::uuid, 'Semilla ' || n, 'Sintética'
        from seeded
        returning id
      )
      insert into zaltyko.athletes (organization_id, person_id)
      select ${organizationId}::uuid, id from people
    `);
  }
  return {
    organizationId,
    userId,
    memberId,
    locationId,
    otherLocationId,
    groupId,
    actor: { userId, memberId },
  };
}

function csv(...lines: string[]): Uint8Array {
  return new TextEncoder().encode(
    [
      "Nombre;Apellidos;Fecha de nacimiento;Grupo;Nombre del tutor;Apellidos del tutor;Email del tutor;Teléfono del tutor;Parentesco",
      ...lines,
    ].join("\r\n")
  );
}

const THREE_ATHLETES = csv(
  "Lucía;Prueba;15/03/2016;Iniciación CI;Marta;Prueba;marta.ci@example.invalid;+34 600 000 001;Madre",
  "Ana;Prueba;20/05/2018;;Marta;Prueba;marta.ci@example.invalid;;Madre",
  "Bea;Sintética;01/02/2015;;;;;;"
);

function base(fixture: Fixture) {
  return { organizationId: fixture.organizationId, userId: fixture.userId, actor: fixture.actor };
}

async function previewAndConfirm(fixture: Fixture, fileBytes: Uint8Array, idempotencyKey = `ci-import-${randomUUID()}`) {
  const preview = await previewAthleteImport({ ...base(fixture), fileBytes });
  const result = await confirmAthleteImport({
    ...base(fixture),
    fileBytes,
    mapping: preview.mapping,
    previewToken: preview.previewToken,
    idempotencyKey,
  });
  return { preview, result, idempotencyKey };
}

async function counts(organizationId: string) {
  const parts = IMPORT_TABLES.map(
    (table) => sql`
      select ${table}::text as table_name, count(*)::int as count
      from ${sql.identifier("zaltyko")}.${sql.identifier(table)}
      where organization_id = ${organizationId}::uuid
    `
  );
  const result = await db.execute(sql`${sql.join(parts, sql` union all `)}`);
  return Object.fromEntries(result.rows.map((row) => [String(row.table_name), Number(row.count)]));
}

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: { code?: string; status?: number }) => ({ code: error.code, status: error.status })
  );
}

describeDisposablePg("importación de gimnastas en PostgreSQL desechable", () => {
  it("crea gimnastas, familia de hermanas, tutor con contactos y grupo; la misma clave no duplica", async () => {
    const fixture = await seed();
    const { preview, result, idempotencyKey } = await previewAndConfirm(fixture, THREE_ATHLETES);

    expect(preview.summary).toMatchObject({
      total: 3,
      toCreate: 3,
      newFamilies: 2,
      newTutors: 1,
      groupMemberships: 1,
    });
    expect(preview.canConfirm).toBe(true);
    expect(result.replayed).toBe(false);
    expect(result.created.map((item) => item.row)).toEqual([2, 3, 4]);
    expect(result.skipped).toEqual([]);
    expect(result.created[0]!.familyId).toBe(result.created[1]!.familyId);
    expect(result.created[0]!.membershipId).not.toBeNull();

    const afterImport = await counts(fixture.organizationId);
    expect(afterImport).toMatchObject({
      athletes: 3,
      people: 4,
      families: 2,
      family_members: 3,
      guardians: 1,
      guardian_contacts: 2,
      family_guardians: 1,
      group_memberships: 1,
      group_membership_history: 1,
      outbox_events: 1,
      audit_log: 1,
    });
    const stored = await db.execute(sql`
      select person.given_name, person.date_of_birth::text as date_of_birth
      from zaltyko.athletes as athlete
      join zaltyko.people as person
        on person.organization_id = athlete.organization_id and person.id = athlete.person_id
      where athlete.organization_id = ${fixture.organizationId}::uuid
      order by person.given_name
    `);
    expect(stored.rows).toEqual([
      { given_name: "Ana", date_of_birth: "2018-05-20" },
      { given_name: "Bea", date_of_birth: "2015-02-01" },
      { given_name: "Lucía", date_of_birth: "2016-03-15" },
    ]);
    const contacts = await db.execute(sql`
      select kind::text as kind, value, is_primary
      from zaltyko.guardian_contacts
      where organization_id = ${fixture.organizationId}::uuid
      order by kind
    `);
    expect(contacts.rows).toEqual([
      { kind: "email", value: "marta.ci@example.invalid", is_primary: true },
      { kind: "phone", value: "+34600000001", is_primary: true },
    ]);

    // A lost response: the same key replays the stored result.
    const replay = await confirmAthleteImport({
      ...base(fixture),
      fileBytes: THREE_ATHLETES,
      mapping: preview.mapping,
      previewToken: preview.previewToken,
      idempotencyKey,
    });
    expect(replay).toEqual({ ...result, replayed: true });
    expect(await counts(fixture.organizationId)).toEqual(afterImport);

    // The same file again with a new key: every row is now a duplicate.
    const again = await previewAndConfirm(fixture, THREE_ATHLETES);
    expect(again.preview.summary).toMatchObject({ toCreate: 0, duplicates: 3 });
    expect(again.preview.canConfirm).toBe(false);
    expect(again.result.created).toEqual([]);
    expect(again.result.skipped.map((item) => item.code)).toEqual([
      "DUPLICATE_EXISTING",
      "DUPLICATE_EXISTING",
      "DUPLICATE_EXISTING",
    ]);
    const afterSecondFile = await counts(fixture.organizationId);
    expect({ ...afterSecondFile, outbox_events: 0, audit_log: 0 }).toEqual({
      ...afterImport,
      outbox_events: 0,
      audit_log: 0,
    });
  }, 60_000);

  it("rechaza reutilizar la clave con otro fichero y una vista previa que no coincide", async () => {
    const fixture = await seed();
    const { idempotencyKey } = await previewAndConfirm(fixture, THREE_ATHLETES);
    const otherFile = csv("Carla;Prueba;02/02/2017;;;;;;");
    const otherPreview = await previewAthleteImport({ ...base(fixture), fileBytes: otherFile });

    expect(
      await failure(
        confirmAthleteImport({
          ...base(fixture),
          fileBytes: otherFile,
          mapping: otherPreview.mapping,
          previewToken: otherPreview.previewToken,
          idempotencyKey,
        })
      )
    ).toEqual({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(
      await failure(
        confirmAthleteImport({
          ...base(fixture),
          fileBytes: otherFile,
          mapping: otherPreview.mapping,
          previewToken: "0".repeat(64),
          idempotencyKey: `ci-import-${randomUUID()}`,
        })
      )
    ).toEqual({ code: "IMPORT_PREVIEW_STALE", status: 409 });
    expect((await counts(fixture.organizationId)).athletes).toBe(3);
  }, 60_000);

  it("no cruza datos entre academias", async () => {
    const academyA = await seed();
    const academyB = await seed();
    // Academy B already has the same athlete, the same tutor email and a group with the same name.
    await previewAndConfirm(academyB, THREE_ATHLETES);
    const bBefore = await counts(academyB.organizationId);

    const { preview, result } = await previewAndConfirm(academyA, THREE_ATHLETES);
    expect(preview.summary).toMatchObject({ toCreate: 3, duplicates: 0, newTutors: 1 });
    expect(preview.rows.flatMap((row) => row.issues.map((item) => item.code))).not.toContain("GUARDIAN_EXISTING");
    expect(result.created).toHaveLength(3);
    const membership = await db.execute(sql`
      select group_id::text as group_id from zaltyko.group_memberships
      where organization_id = ${academyA.organizationId}::uuid
    `);
    expect(membership.rows).toEqual([{ group_id: academyA.groupId }]);
    expect(await counts(academyB.organizationId)).toEqual(bBefore);

    // A member of A cannot import into B.
    expect(
      await failure(
        previewAthleteImport({
          organizationId: academyB.organizationId,
          userId: academyA.userId,
          actor: academyA.actor,
          fileBytes: THREE_ATHLETES,
        })
      )
    ).toEqual({ code: "FORBIDDEN", status: 403 });
  }, 60_000);

  it("no importa por encima del límite del plan Free", async () => {
    const fixture = await seed({ athleteCount: 29 });
    const { preview, result } = await previewAndConfirm(fixture, THREE_ATHLETES);

    expect(preview.plan).toEqual({ current: 29, limit: 30, readOnly: false });
    expect(preview.rows.map((row) => row.status)).toEqual(["create", "skipped", "skipped"]);
    expect(result.created.map((item) => item.row)).toEqual([2]);
    expect(result.skipped.map((item) => item.code)).toEqual(["PLAN_LIMIT", "PLAN_LIMIT"]);
    expect((await counts(fixture.organizationId)).athletes).toBe(30);
  }, 60_000);

  it("en solo lectura avisa en la vista previa y no escribe nada al confirmar", async () => {
    const fixture = await seed({ athleteCount: 31 });
    const before = await counts(fixture.organizationId);
    const preview = await previewAthleteImport({ ...base(fixture), fileBytes: THREE_ATHLETES });

    expect(preview.plan.readOnly).toBe(true);
    expect(preview.canConfirm).toBe(false);
    expect(
      await failure(
        confirmAthleteImport({
          ...base(fixture),
          fileBytes: THREE_ATHLETES,
          mapping: preview.mapping,
          previewToken: preview.previewToken,
          idempotencyKey: `ci-import-${randomUUID()}`,
        })
      )
    ).toEqual({ code: "PLAN_OVER_CAPACITY", status: 409 });
    expect(await counts(fixture.organizationId)).toEqual(before);
  }, 60_000);

  it("un entrenador no puede previsualizar ni importar", async () => {
    const fixture = await seed({ role: "coach", locationScopeMode: "selected" });
    const before = await counts(fixture.organizationId);
    expect(await failure(previewAthleteImport({ ...base(fixture), fileBytes: THREE_ATHLETES }))).toEqual({
      code: "FORBIDDEN",
      status: 403,
    });
    // A valid token for this file, so the refusal comes from the role.
    const mapping = deriveImportMapping([
      "Nombre",
      "Apellidos",
      "Fecha de nacimiento",
      "Grupo",
      "Nombre del tutor",
      "Apellidos del tutor",
      "Email del tutor",
      "Teléfono del tutor",
      "Parentesco",
    ]);
    expect(
      await failure(
        confirmAthleteImport({
          ...base(fixture),
          fileBytes: THREE_ATHLETES,
          mapping,
          previewToken: athleteImportPreviewToken(THREE_ATHLETES, mapping),
          idempotencyKey: `ci-import-${randomUUID()}`,
        })
      )
    ).toEqual({ code: "FORBIDDEN", status: 403 });
    expect(await counts(fixture.organizationId)).toEqual(before);
  }, 60_000);

  it("la coordinación con una sede solo importa a grupos de su sede", async () => {
    const fixture = await seed({ role: "manager", locationScopeMode: "selected" });
    const file = csv(
      "Lucía;Prueba;15/03/2016;Iniciación CI;;;;;",
      "Ana;Prueba;20/05/2018;Otra sede CI;;;;;",
      "Bea;Sintética;01/02/2015;;;;;;"
    );
    const { preview, result } = await previewAndConfirm(fixture, file);
    expect(preview.rows.map((row) => [row.status, row.issues.map((item) => item.code)])).toEqual([
      ["create", []],
      ["error", ["GROUP_NOT_FOUND"]],
      ["error", ["GROUP_REQUIRED"]],
    ]);
    expect(result.created).toHaveLength(1);
    const membership = await db.execute(sql`
      select group_id::text as group_id from zaltyko.group_memberships
      where organization_id = ${fixture.organizationId}::uuid
    `);
    expect(membership.rows).toEqual([{ group_id: fixture.groupId }]);
  }, 60_000);

  it("no supera la capacidad del grupo", async () => {
    const fixture = await seed({ groupCapacity: 1 });
    const file = csv("Lucía;Prueba;15/03/2016;Iniciación CI;;;;;", "Ana;Prueba;20/05/2018;Iniciación CI;;;;;");
    const { result } = await previewAndConfirm(fixture, file);
    expect(result.created.map((item) => item.row)).toEqual([2]);
    expect(result.skipped).toEqual([{ row: 3, code: "GROUP_FULL", message: "El grupo no tiene plazas libres." }]);
  }, 60_000);
});
