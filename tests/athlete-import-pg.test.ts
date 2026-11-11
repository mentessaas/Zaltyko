/**
 * O4 · Importación de gimnastas contra PostgreSQL desechable: lo que se
 * escribe, aislamiento entre academias, duplicados, idempotencia, límite del
 * plan, solo lectura, permisos, tutores existentes, concurrencia y los
 * bloqueos de la confirmación. Cada prueba siembra sus propias academias con
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

const HEADERS = [
  "Nombre",
  "Apellidos",
  "Fecha de nacimiento",
  "Grupo",
  "Nombre del tutor",
  "Apellidos del tutor",
  "Email del tutor",
  "Teléfono del tutor",
  "Parentesco",
];
const MAPPING = deriveImportMapping(HEADERS);

type Fixture = {
  organizationId: string;
  userId: string;
  memberId: string;
  locationId: string;
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
    values (${locationId}::uuid, ${organizationId}::uuid, ${`ci-imp-${organizationId.slice(0, 8)}`},
      'CI import site', 'Europe/Madrid', true)
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
    values (${groupId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, 'Iniciación CI',
      ${options.groupCapacity === undefined ? 10 : options.groupCapacity}, 'active')
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
  return { organizationId, userId, memberId, locationId, groupId, actor: { userId, memberId } };
}

/** An existing tutor with one family, as the manual flows leave it. */
async function seedTutor(fixture: Fixture, tutor: { givenName: string; familyName: string; email: string }) {
  const personId = randomUUID();
  const guardianId = randomUUID();
  const familyId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.families (id, organization_id) values (${familyId}::uuid, ${fixture.organizationId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (${personId}::uuid, ${fixture.organizationId}::uuid, ${tutor.givenName}, ${tutor.familyName})
  `);
  await db.execute(sql`
    insert into zaltyko.guardians (id, organization_id, person_id)
    values (${guardianId}::uuid, ${fixture.organizationId}::uuid, ${personId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.family_guardians (organization_id, family_id, guardian_id, relationship)
    values (${fixture.organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, 'parent')
  `);
  await db.execute(sql`
    insert into zaltyko.guardian_contacts (organization_id, guardian_id, kind, value, normalized_value, is_primary)
    values (${fixture.organizationId}::uuid, ${guardianId}::uuid, 'email', ${tutor.email}, ${tutor.email}, true)
  `);
  return { guardianId, familyId };
}

function csv(...lines: string[]): Uint8Array<ArrayBuffer> {
  // Copied into a plain ArrayBuffer: the service takes Uint8Array<ArrayBuffer>.
  const encoded = new TextEncoder().encode([HEADERS.join(";"), ...lines].join("\r\n"));
  const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  bytes.set(encoded);
  return bytes;
}

const THREE_ATHLETES = csv(
  "Lucía;Prueba;15/03/2016;Iniciación CI;Marta;Prueba;marta.ci@example.invalid;+34600000001;Madre",
  "Ana;Prueba;20/05/2018;;Marta;Prueba;marta.ci@example.invalid;;Madre",
  "Bea;Sintética;01/02/2015;;;;;;"
);

function base(fixture: Fixture) {
  return { organizationId: fixture.organizationId, userId: fixture.userId, actor: fixture.actor };
}

function confirmCommand(fixture: Fixture, fileBytes: Uint8Array<ArrayBuffer>, idempotencyKey = `ci-import-${randomUUID()}`) {
  return {
    ...base(fixture),
    fileBytes,
    mapping: MAPPING,
    previewToken: athleteImportPreviewToken(fileBytes, MAPPING, fixture),
    idempotencyKey,
    legalBasisConfirmed: true as const,
  };
}

async function previewAndConfirm(fixture: Fixture, fileBytes: Uint8Array<ArrayBuffer>, idempotencyKey = `ci-import-${randomUUID()}`) {
  const preview = await previewAthleteImport({ ...base(fixture), fileBytes });
  expect(preview.previewToken).toBe(athleteImportPreviewToken(fileBytes, MAPPING, fixture));
  const result = await confirmAthleteImport(confirmCommand(fixture, fileBytes, idempotencyKey));
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

/** Waits until `expected` other sessions wait on a lock while running a statement like `pattern`. */
async function waitForLockWaiters(pattern: string, expected: number) {
  const deadline = Date.now() + 15_000;
  let waiting = 0;
  while (Date.now() < deadline) {
    const result = await db.execute(sql`
      select count(*)::int as waiting
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and wait_event_type = 'Lock'
        and query like ${pattern}
    `);
    waiting = Number(result.rows[0]?.waiting ?? 0);
    if (waiting >= expected) return waiting;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Only ${waiting} of ${expected} sessions waited on ${pattern}`);
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describeDisposablePg("importación de gimnastas en PostgreSQL desechable", () => {
  it("crea gimnastas, familia de hermanas, tutor con contactos y grupo; la misma clave no duplica", async () => {
    const fixture = await seed();
    const { preview, result, idempotencyKey } = await previewAndConfirm(fixture, THREE_ATHLETES);

    expect(preview.summary).toMatchObject({ total: 3, toCreate: 3, newFamilies: 2, newTutors: 1, groupMemberships: 1 });
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
      select person.given_name, person.date_of_birth::text as date_of_birth,
             member.starts_on::text as starts_on,
             (current_timestamp at time zone 'Europe/Madrid')::date::text as madrid_today
      from zaltyko.athletes as athlete
      join zaltyko.people as person
        on person.organization_id = athlete.organization_id and person.id = athlete.person_id
      join zaltyko.family_members as member
        on member.organization_id = athlete.organization_id and member.athlete_id = athlete.id
      where athlete.organization_id = ${fixture.organizationId}::uuid
      order by person.given_name
    `);
    expect(stored.rows.map((row) => [row.given_name, row.date_of_birth])).toEqual([
      ["Ana", "2018-05-20"],
      ["Bea", "2015-02-01"],
      ["Lucía", "2016-03-15"],
    ]);
    // The family link starts on the civil date of the site, not UTC.
    expect(stored.rows.every((row) => row.starts_on === row.madrid_today)).toBe(true);
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
    const audit = await db.execute(sql`
      select after from zaltyko.audit_log
      where organization_id = ${fixture.organizationId}::uuid and action = 'athlete.import_confirmed'
    `);
    expect(audit.rows[0]!.after).toMatchObject({ createdCount: 3, legalBasisConfirmed: true });
    const event = await db.execute(sql`
      select payload::text as payload from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid and event_name = 'athlete.import_confirmed'
    `);
    // The event carries identifiers and codes only, never names or contacts.
    expect(String(event.rows[0]!.payload)).not.toMatch(/Lucía|Marta|marta\.ci|\+34600000001/u);

    // A lost response: the same key replays the stored result.
    const replay = await confirmAthleteImport(confirmCommand(fixture, THREE_ATHLETES, idempotencyKey));
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

  it("rechaza reutilizar la clave con otro fichero, una vista previa ajena y un token de otra academia", async () => {
    const fixture = await seed();
    const other = await seed();
    const { idempotencyKey } = await previewAndConfirm(fixture, THREE_ATHLETES);
    const otherFile = csv("Carla;Prueba;02/02/2017;;;;;;");

    expect(await failure(confirmAthleteImport(confirmCommand(fixture, otherFile, idempotencyKey)))).toEqual({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(
      await failure(confirmAthleteImport({ ...confirmCommand(fixture, otherFile), previewToken: "0".repeat(64) }))
    ).toEqual({ code: "IMPORT_PREVIEW_STALE", status: 409 });
    // A token is bound to its academy and user.
    expect(
      await failure(
        confirmAthleteImport({
          ...confirmCommand(fixture, otherFile),
          previewToken: athleteImportPreviewToken(otherFile, MAPPING, other),
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
    expect(await failure(confirmAthleteImport(confirmCommand(fixture, THREE_ATHLETES)))).toEqual({
      code: "PLAN_OVER_CAPACITY",
      status: 409,
    });
    expect(await counts(fixture.organizationId)).toEqual(before);
  }, 60_000);

  it.each([
    ["un entrenador", { role: "coach", locationScopeMode: "selected" }, "FORBIDDEN"],
    ["la coordinación", { role: "manager", locationScopeMode: "all" }, "FORBIDDEN"],
    ["la propiedad con sedes limitadas", { role: "owner", locationScopeMode: "selected" }, "LOCATION_SCOPE_DENIED"],
    ["la administración con sedes limitadas", { role: "admin", locationScopeMode: "selected" }, "LOCATION_SCOPE_DENIED"],
  ] as const)("%s no puede previsualizar ni importar", async (_label, options, code) => {
    const fixture = await seed(options);
    const before = await counts(fixture.organizationId);
    expect(await failure(previewAthleteImport({ ...base(fixture), fileBytes: THREE_ATHLETES }))).toEqual({
      code,
      status: 403,
    });
    // A valid token for this file, so the refusal comes from the role.
    expect(await failure(confirmAthleteImport(confirmCommand(fixture, THREE_ATHLETES)))).toEqual({
      code,
      status: 403,
    });
    expect(await counts(fixture.organizationId)).toEqual(before);
  }, 60_000);

  it("reutiliza un tutor existente solo si coinciden el contacto y el nombre", async () => {
    const fixture = await seed();
    const tutor = await seedTutor(fixture, { givenName: "Marta", familyName: "Prueba", email: "marta.ci@example.invalid" });
    const file = csv(
      "Lucía;Prueba;15/03/2016;;MARTA;prueba;Marta.CI@example.invalid;;Madre",
      "Ana;Prueba;20/05/2018;;Jorge;Prueba;marta.ci@example.invalid;;Padre"
    );
    const { preview, result } = await previewAndConfirm(fixture, file);
    expect(preview.rows.map((row) => [row.status, row.issues.map((item) => item.code)])).toEqual([
      ["create", ["GUARDIAN_EXISTING"]],
      ["error", ["GUARDIAN_NAME_MISMATCH"]],
    ]);
    expect(result.created).toEqual([expect.objectContaining({ row: 2, familyId: tutor.familyId })]);
    expect((await counts(fixture.organizationId)).guardians).toBe(1);
  }, 60_000);

  it("no elige familia cuando el email lo comparten dos tutores activos", async () => {
    const fixture = await seed();
    await seedTutor(fixture, { givenName: "Marta", familyName: "Prueba", email: "familia.ci@example.invalid" });
    await seedTutor(fixture, { givenName: "Marta", familyName: "Prueba", email: "familia.ci@example.invalid" });
    const before = await counts(fixture.organizationId);
    const { preview, result } = await previewAndConfirm(
      fixture,
      csv("Lucía;Prueba;15/03/2016;;Marta;Prueba;familia.ci@example.invalid;;Madre")
    );
    expect(preview.rows[0]).toMatchObject({ status: "error", issues: [expect.objectContaining({ code: "GUARDIAN_AMBIGUOUS" })] });
    expect(result.created).toEqual([]);
    expect({ ...(await counts(fixture.organizationId)), outbox_events: 0, audit_log: 0 }).toEqual({
      ...before,
      outbox_events: 0,
      audit_log: 0,
    });
  }, 60_000);

  it("no supera la capacidad del grupo", async () => {
    const fixture = await seed({ groupCapacity: 1 });
    const file = csv("Lucía;Prueba;15/03/2016;Iniciación CI;;;;;", "Ana;Prueba;20/05/2018;Iniciación CI;;;;;");
    const { result } = await previewAndConfirm(fixture, file);
    expect(result.created.map((item) => item.row)).toEqual([2]);
    expect(result.skipped).toEqual([{ row: 3, code: "GROUP_FULL", message: "El grupo no tiene plazas libres." }]);
  }, 60_000);

  it("dos confirmaciones simultáneas del mismo fichero crean cada gimnasta una sola vez", async () => {
    const fixture = await seed();
    const held = signal();
    const release = signal();
    // Hold the organization row so both confirmations queue behind it.
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from zaltyko.organizations where id = ${fixture.organizationId}::uuid for update`);
      held.resolve();
      await release.promise;
    });
    await held.promise;
    const first = confirmAthleteImport(confirmCommand(fixture, THREE_ATHLETES));
    const second = confirmAthleteImport(confirmCommand(fixture, THREE_ATHLETES));
    try {
      expect(await waitForLockWaiters("%from zaltyko.organizations%for update%", 2)).toBe(2);
    } finally {
      release.resolve();
      await holder;
    }
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.created.length).sort()).toEqual([0, 3]);
    const loser = results.find((result) => result.created.length === 0)!;
    expect(loser.skipped.map((item) => item.code)).toEqual(["DUPLICATE_EXISTING", "DUPLICATE_EXISTING", "DUPLICATE_EXISTING"]);
    expect((await counts(fixture.organizationId)).athletes).toBe(3);
  }, 60_000);

  it("vuelve a decidir bajo el bloqueo: lo creado mientras esperaba ya no se duplica", async () => {
    // Fails if the confirmation trusted the classification made before the lock.
    const fixture = await seed();
    const held = signal();
    const release = signal();
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from zaltyko.organizations where id = ${fixture.organizationId}::uuid for update`);
      held.resolve();
      await release.promise;
      // While the confirmation waits, the same athlete is created by hand.
      await tx.execute(sql`
        with person as (
          insert into zaltyko.people (organization_id, given_name, family_name, date_of_birth)
          values (${fixture.organizationId}::uuid, 'Bea', 'Sintética', '2015-02-01')
          returning id
        )
        insert into zaltyko.athletes (organization_id, person_id) select ${fixture.organizationId}::uuid, id from person
      `);
    });
    await held.promise;
    const confirmation = confirmAthleteImport(confirmCommand(fixture, THREE_ATHLETES));
    try {
      expect(await waitForLockWaiters("%from zaltyko.organizations%for update%", 1)).toBe(1);
    } finally {
      release.resolve();
      await holder;
    }
    const result = await confirmation;
    expect(result.created.map((item) => item.row)).toEqual([2, 3]);
    expect(result.skipped).toEqual([expect.objectContaining({ row: 4, code: "DUPLICATE_EXISTING" })]);
    expect((await counts(fixture.organizationId)).athletes).toBe(3);
  }, 60_000);

  it("toma el cupo del grupo antes de decidir: espera a quien lo tiene", async () => {
    // Fails if the confirmation stopped locking the group capacity. The holder
    // takes only the group lock and writes nothing, so it never needs the
    // organization row the import holds.
    const fixture = await seed({ groupCapacity: 1 });
    const held = signal();
    const release = signal();
    const holder = db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${fixture.organizationId}:group-capacity:${fixture.groupId}`}, 0))`
      );
      held.resolve();
      await release.promise;
    });
    await held.promise;
    const confirmation = confirmAthleteImport(
      confirmCommand(fixture, csv("Lucía;Prueba;15/03/2016;Iniciación CI;;;;;"))
    );
    try {
      expect(await waitForLockWaiters("%pg_advisory_xact_lock%", 1)).toBe(1);
    } finally {
      release.resolve();
      await holder;
    }
    const result = await confirmation;
    expect(result.created.map((item) => item.row)).toEqual([2]);
  }, 60_000);

  it("respeta la plaza que otra alta ocupó mientras esperaba, con el mismo orden de cerrojos", async () => {
    // Fails if the confirmation trusted the group occupancy read before the
    // locks. The other writer follows the canonical order of the group
    // membership commands: organization row, then the group capacity lock.
    const fixture = await seed({ groupCapacity: 1 });
    const held = signal();
    const release = signal();
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from zaltyko.organizations where id = ${fixture.organizationId}::uuid for update`);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${fixture.organizationId}:group-capacity:${fixture.groupId}`}, 0))`
      );
      held.resolve();
      await release.promise;
      // While the confirmation waits, the group's only place is taken.
      await tx.execute(sql`
        with person as (
          insert into zaltyko.people (organization_id, given_name, family_name)
          values (${fixture.organizationId}::uuid, 'Plaza', 'Ocupada')
          returning id
        ), athlete as (
          insert into zaltyko.athletes (organization_id, person_id)
          select ${fixture.organizationId}::uuid, id from person
          returning id
        )
        insert into zaltyko.group_memberships (organization_id, group_id, athlete_id, status, starts_on)
        select ${fixture.organizationId}::uuid, ${fixture.groupId}::uuid, id, 'active', current_date from athlete
      `);
    });
    await held.promise;
    const confirmation = confirmAthleteImport(
      confirmCommand(fixture, csv("Lucía;Prueba;15/03/2016;Iniciación CI;;;;;"))
    );
    try {
      expect(await waitForLockWaiters("%from zaltyko.organizations%for update%", 1)).toBe(1);
    } finally {
      release.resolve();
      await holder;
    }
    const result = await confirmation;
    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([{ row: 2, code: "GROUP_FULL", message: "El grupo no tiene plazas libres." }]);
  }, 60_000);
});
