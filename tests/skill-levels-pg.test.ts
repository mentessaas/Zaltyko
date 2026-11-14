import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  createSkillTemplate,
  evaluateSkills,
  getAthleteSkills,
  getFamilyDiploma,
  getFamilySkills,
  getGroupSkillRoster,
  getLevelPassDiploma,
  getSessionSkillRoster,
  getSkillTemplate,
  isSkillLevelsAvailableForPage,
  isSkillLevelsStorageInstalled,
  listSkillTemplates,
  passSkillLevel,
  saveSkillTemplate,
} from "@/modules/skill-levels/application/skill-level-service";
import { SKILL_LEVELS_ENV_FLAG, type SkillTemplateView } from "@/modules/skill-levels/domain/skill-levels";

/**
 * Niveles y progresión sobre PostgreSQL desechable de GitHub. Instala el
 * candidato SQL solo aquí, después de todos los guardas, y borra sus tablas al
 * terminar; nunca en un proyecto enlazado ni con credenciales externas. Cubre:
 * función dormida (bandera y tablas), RLS/REVOKE, aislamiento entre academias,
 * plantillas (alta, copia, edición, archivo y roles), evaluación en bloque con
 * idempotencia, paso de nivel con sus reglas, listas de grupo y de sesión,
 * diploma y lectura de familias.
 */
const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";

function assertDisposableTarget() {
  const connection = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  let target: URL;
  try {
    target = new URL(connection ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    !disposablePgEnabled ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
    target.username !== "supabase_admin" ||
    !target.password ||
    !target.port ||
    target.pathname !== "/postgres" ||
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(
      (value) => value !== connection
    )
  ) {
    throw new Error("Disposable GitHub Linux loopback Postgres is required");
  }
  for (const name of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const candidate = () =>
  readFileSync(resolve(process.cwd(), "docs/deployment/candidates/20261114121000_skill_levels_candidate.sql"), "utf8");

const TABLES = ["skill_templates", "skill_levels", "skill_elements", "athlete_skill_progress", "athlete_level_passes"];

async function expectPgCode(promise: Promise<unknown>, code: string) {
  const error = (await promise.then(
    () => null,
    (failure) => failure
  )) as { code?: string; cause?: { code?: string } } | null;
  expect(error).not.toBeNull();
  expect(error?.cause?.code ?? error?.code).toBe(code);
}

async function expectCandidateRefused(promise: Promise<unknown>) {
  // Drizzle envuelve el error; el raise del preflight está en cause (SQLSTATE P0001).
  const error = (await promise.then(
    () => null,
    (failure) => failure
  )) as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  expect(error).not.toBeNull();
  const raised = error?.cause ?? error;
  expect(raised?.code).toBe("P0001");
  expect(raised?.message).toMatch(/^Skill levels candidate requires .* absent; inspect existing schema before promotion$/);
}

type Actor = { userId: string; memberId: string };

async function member(
  organizationId: string,
  role: "owner" | "admin" | "manager" | "coach",
  scopeMode: "all" | "selected",
  locationIds: string[] = [],
  label: string = role
): Promise<Actor> {
  const userId = randomUUID();
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-skills-${label}-${userId}@example.invalid`})`
  );
  const memberId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode)
    values (${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid, ${role}, 'active', ${scopeMode})
  `);
  for (const locationId of locationIds) {
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (organization_id, member_id, location_id)
      values (${organizationId}::uuid, ${memberId}::uuid, ${locationId}::uuid)
    `);
  }
  return { userId, memberId };
}

async function academy(label: string, sites: number) {
  const organizationId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI niveles ${label}`}, 'active')
  `);
  const locationIds: string[] = [];
  for (let index = 0; index < sites; index += 1) {
    const locationId = randomUUID();
    locationIds.push(locationId);
    await db.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
      values (${locationId}::uuid, ${organizationId}::uuid,
        ${`ci-skl-${index}-${organizationId.slice(0, 8)}`}, ${`Sede ${label} ${index + 1}`}, 'Europe/Madrid', true)
    `);
  }
  return { organizationId, locationIds };
}

async function athlete(organizationId: string, givenName: string, active = true) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (${id}::uuid, ${organizationId}::uuid, ${givenName}, 'Niveles')
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id, is_active)
    values (${id}::uuid, ${organizationId}::uuid, ${id}::uuid, ${active})
  `);
  return id;
}

async function group(organizationId: string, locationId: string, name: string) {
  const id = randomUUID();
  await db.execute(sql`
    insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status)
    values (${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${name}, 20, 'active')
  `);
  return id;
}

async function joinGroup(
  organizationId: string,
  groupId: string,
  athleteId: string,
  status: "active" | "ended" = "active"
) {
  await db.execute(sql`
    insert into zaltyko.group_memberships (organization_id, group_id, athlete_id, status, starts_on, ends_on)
    values (${organizationId}::uuid, ${groupId}::uuid, ${athleteId}::uuid, ${status}, '2026-09-01',
      ${status === "ended" ? "2026-10-01" : null})
  `);
}

async function count(table: string, organizationId: string) {
  const result = await db.execute(
    sql`select count(*)::int as count from ${sql.identifier("zaltyko")}.${sql.identifier(table)} where organization_id = ${organizationId}::uuid`
  );
  return Number((result.rows[0] as { count: number }).count);
}

function setFlag(on: boolean) {
  if (on) process.env[SKILL_LEVELS_ENV_FLAG] = "true";
  else delete process.env[SKILL_LEVELS_ENV_FLAG];
}

describe.skipIf(!disposablePgEnabled)("niveles y progresión en PostgreSQL desechable", () => {
  const previousFlag = process.env[SKILL_LEVELS_ENV_FLAG];
  let a: Awaited<ReturnType<typeof academy>>;
  let b: Awaited<ReturnType<typeof academy>>;
  let ownerA: Actor;
  let managerA1: Actor;
  let coachA1: Actor;
  let coachA2: Actor;
  let ownerB: Actor;
  // Ana y Dani: grupo activo en S1. Bea: solo S2. Carla: grupo terminado en S1.
  // Eva: archivada con grupo en S1. Zoe: academia B.
  let ana: string;
  let bea: string;
  let carla: string;
  let dani: string;
  let eva: string;
  let zoe: string;
  let groupS1: string;
  let groupS2: string;
  let sessionS1: string;
  let template: SkillTemplateView;

  const s1 = () => ({ organizationId: a.organizationId, locationId: a.locationIds[0]! });
  const s2 = () => ({ organizationId: a.organizationId, locationId: a.locationIds[1]! });

  const createStarter = (actor: Actor, overrides: Record<string, unknown> = {}) =>
    createSkillTemplate({
      actor,
      command: { ...s1(), clientRequestId: randomUUID(), source: "starter", starterKey: "gaf_progresion_general", ...overrides },
    });

  const levelElements = (view: SkillTemplateView, levelIndex: number) => view.levels[levelIndex]!.elements.map((element) => element.id);

  function evaluate(
    actor: Actor,
    scope: { organizationId: string; locationId: string },
    athleteIds: string[],
    elementIds: string[],
    status: string,
    overrides: Record<string, unknown> = {}
  ) {
    return evaluateSkills({
      actor,
      command: {
        ...scope,
        clientRequestId: randomUUID(),
        templateId: template.id,
        athleteIds,
        elementIds,
        status,
        ...overrides,
      },
    });
  }

  function pass(actor: Actor, athleteId: string, levelId: string, scope = s1(), overrides: Record<string, unknown> = {}) {
    return passSkillLevel({
      actor,
      athleteId,
      command: { ...scope, clientRequestId: randomUUID(), templateId: template.id, levelId, ...overrides },
    });
  }

  beforeAll(async () => {
    assertDisposableTarget();
    setFlag(false);
    a = await academy("A", 2);
    b = await academy("B", 1);
    ownerA = await member(a.organizationId, "owner", "all");
    managerA1 = await member(a.organizationId, "manager", "selected", [a.locationIds[0]!]);
    coachA1 = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "coach1");
    coachA2 = await member(a.organizationId, "coach", "selected", [a.locationIds[1]!], "coach2");
    ownerB = await member(b.organizationId, "owner", "all");

    ana = await athlete(a.organizationId, "Ana");
    bea = await athlete(a.organizationId, "Bea");
    carla = await athlete(a.organizationId, "Carla");
    dani = await athlete(a.organizationId, "Dani");
    eva = await athlete(a.organizationId, "Eva", false);
    zoe = await athlete(b.organizationId, "Zoe");
    groupS1 = await group(a.organizationId, a.locationIds[0]!, "Base 3 GAF");
    groupS2 = await group(a.organizationId, a.locationIds[1]!, "Base 2 GAF");
    await joinGroup(a.organizationId, groupS1, ana);
    await joinGroup(a.organizationId, groupS1, dani);
    await joinGroup(a.organizationId, groupS1, carla, "ended");
    await joinGroup(a.organizationId, groupS1, eva);
    await joinGroup(a.organizationId, groupS2, bea);
    await joinGroup(b.organizationId, await group(b.organizationId, b.locationIds[0]!, "Base B"), zoe);

    const classS1 = randomUUID();
    await db.execute(sql`
      insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from)
      values (${classS1}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, 'CI Base 3', 12, 'active', '2026-09-01')
    `);
    await db.execute(sql`
      insert into zaltyko.class_template_groups (organization_id, class_template_id, group_id)
      values (${a.organizationId}::uuid, ${classS1}::uuid, ${groupS1}::uuid)
    `);
    sessionS1 = randomUUID();
    await db.execute(sql`
      insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at)
      values (${sessionS1}::uuid, ${a.organizationId}::uuid, ${a.locationIds[0]}::uuid, ${classS1}::uuid, 'completed',
                '2026-10-05T16:30:00Z', '2026-10-05T18:00:00Z')
    `);

    // Función dormida: con la bandera apagada, o sin el candidato, todo responde 503 sin escribir.
    expect(await isSkillLevelsStorageInstalled(db)).toBe(false);
    await expect(listSkillTemplates({ actor: ownerA, query: s1() })).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
    });
    setFlag(true);
    expect(await isSkillLevelsAvailableForPage(db)).toBe(false);
    await expect(listSkillTemplates({ actor: ownerA, query: s1() })).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
    });
    await expect(createStarter(ownerA)).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE", status: 503 });
    // El preflight rechaza una relación parcial antes de tocar nada.
    await expectCandidateRefused(
      db.transaction(async (tx) => {
        await tx.execute(sql`create table zaltyko.skill_levels (id uuid)`);
        await tx.execute(sql.raw(candidate()));
      })
    );
    expect(await isSkillLevelsStorageInstalled(db)).toBe(false);
    await db.execute(sql.raw(candidate()));
  }, 60_000);

  afterAll(async () => {
    if (previousFlag === undefined) delete process.env[SKILL_LEVELS_ENV_FLAG];
    else process.env[SKILL_LEVELS_ENV_FLAG] = previousFlag;
    if (!disposablePgEnabled) return;
    for (const table of [...TABLES].reverse()) {
      await db.execute(sql`drop table if exists ${sql.identifier("zaltyko")}.${sql.identifier(table)}`);
    }
  });

  it("fuerza RLS, niega el acceso directo de anon/authenticated y rechaza reinstalar", async () => {
    expect(await isSkillLevelsStorageInstalled(db)).toBe(true);
    expect(await isSkillLevelsAvailableForPage(db)).toBe(true);
    // Con la bandera apagada la función no existe aunque las tablas estén.
    setFlag(false);
    expect(await isSkillLevelsAvailableForPage(db)).toBe(false);
    await expect(listSkillTemplates({ actor: ownerA, query: s1() })).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE" });
    setFlag(true);

    const inventory = await db.execute(sql`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
        has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
      from pg_class c
      where c.oid in ('zaltyko.skill_templates'::regclass, 'zaltyko.skill_levels'::regclass,
                      'zaltyko.skill_elements'::regclass, 'zaltyko.athlete_skill_progress'::regclass,
                      'zaltyko.athlete_level_passes'::regclass)
    `);
    expect(inventory.rows).toHaveLength(5);
    for (const row of inventory.rows) {
      expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, anon_access: false, authenticated_access: false });
    }
    for (const role of ["anon", "authenticated"]) {
      for (const table of TABLES) {
        await expectPgCode(
          db.transaction(async (tx) => {
            await tx.execute(sql.raw(`set local role ${role}`));
            await tx.execute(sql`select id from ${sql.identifier("zaltyko")}.${sql.identifier(table)} limit 1`);
          }),
          "42501"
        );
      }
    }
    await expectCandidateRefused(db.execute(sql.raw(candidate())));
  });

  it("crea plantillas de ejemplo, en blanco y copias, de forma idempotente y con nombre único", async () => {
    const clientRequestId = randomUUID();
    const created = await createStarter(ownerA, { clientRequestId });
    expect(created).toMatchObject({ revision: 1, replayed: false });
    expect(await createStarter(ownerA, { clientRequestId })).toEqual({ ...created, replayed: true });
    // Misma plantilla con otro identificador: el nombre ya existe en esa disciplina.
    await expect(createStarter(ownerA)).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    // Un ejemplo que no existe no se inventa.
    await expect(createStarter(ownerA, { starterKey: "inventado" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    template = await getSkillTemplate({ actor: ownerA, templateId: created.id, query: s1() });
    expect(template).toMatchObject({ discipline: "artistic_female", source: "starter", starterKey: "gaf_progresion_general", archived: false, canEdit: true });
    expect(template.levels).toHaveLength(4);
    expect(template.levels.map((level) => level.position)).toEqual([1, 2, 3, 4]);
    expect(template.description).toMatch(/orientativa/i);
    expect(await count("skill_elements", a.organizationId)).toBe(template.elementCount);

    // La coordinación crea una plantilla en blanco de rítmica con un nivel vacío.
    const blank = await createSkillTemplate({
      actor: managerA1,
      command: { ...s1(), clientRequestId: randomUUID(), source: "blank", discipline: "rhythmic", name: "Base GR" },
    });
    const blankView = await getSkillTemplate({ actor: managerA1, templateId: blank.id, query: s1() });
    expect(blankView.levels).toHaveLength(1);
    expect(blankView.levels[0]!.elements).toEqual([]);

    // Copiar una plantilla propia conserva niveles y elementos con otros ids.
    const copy = await createSkillTemplate({
      actor: ownerA,
      command: { ...s1(), clientRequestId: randomUUID(), source: "copy", templateId: template.id, name: "Mi GAF" },
    });
    const copyView = await getSkillTemplate({ actor: ownerA, templateId: copy.id, query: s1() });
    expect(copyView).toMatchObject({ source: "copy", starterKey: null, discipline: "artistic_female" });
    expect(copyView.levels.map((level) => level.elements.length)).toEqual(template.levels.map((level) => level.elements.length));
    expect(copyView.levels[0]!.id).not.toBe(template.levels[0]!.id);
  });

  it("el entrenador lee las plantillas pero no las crea ni las edita; otra academia no las ve", async () => {
    const list = await listSkillTemplates({ actor: coachA1, query: s1() });
    expect(list.canManage).toBe(false);
    expect(list.templates.map((entry) => entry.id)).toContain(template.id);
    expect(list.starters.length).toBeGreaterThan(0);
    expect((await getSkillTemplate({ actor: coachA1, templateId: template.id, query: s1() })).canEdit).toBe(false);
    await expect(createStarter(coachA1, { name: "Otra" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      saveSkillTemplate({
        actor: coachA1,
        templateId: template.id,
        command: {
          ...s1(),
          expectedRevision: template.revision,
          name: template.name,
          levels: template.levels.map((level) => ({ id: level.id, name: level.name, elements: level.elements })),
        },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    // Un entrenador de otra sede ve las plantillas (son de la academia) pero no entra en la sede ajena.
    expect((await listSkillTemplates({ actor: coachA2, query: s2() })).templates.length).toBeGreaterThan(0);
    await expect(listSkillTemplates({ actor: coachA2, query: s1() })).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });

    // Otra academia: ni la ve en su lista, ni la abre, ni entra en la nuestra.
    const scopeB = { organizationId: b.organizationId, locationId: b.locationIds[0]! };
    expect((await listSkillTemplates({ actor: ownerB, query: scopeB })).templates).toEqual([]);
    await expect(getSkillTemplate({ actor: ownerB, templateId: template.id, query: scopeB })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(listSkillTemplates({ actor: ownerB, query: s1() })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      createSkillTemplate({
        actor: ownerB,
        command: { ...scopeB, clientRequestId: randomUUID(), source: "copy", templateId: template.id, name: "Robada" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("evalúa varias gimnastas a la vez, de forma idempotente, con fecha y sin cambiar quién lo consiguió", async () => {
    const first = levelElements(template, 0).slice(0, 2);
    const clientRequestId = randomUUID();
    const marked = await evaluate(coachA1, s1(), [ana, dani], first, "in_progress", { clientRequestId });
    expect(marked).toMatchObject({ changed: 4, unchanged: 0, replayed: false });
    expect(await evaluate(coachA1, s1(), [ana, dani], first, "in_progress", { clientRequestId })).toMatchObject({
      replayed: true,
      changed: 0,
    });
    // Misma marca con otra petición: nada cambia.
    expect(await evaluate(ownerA, s1(), [ana], first, "in_progress")).toMatchObject({ changed: 0, unchanged: 2 });

    // Dos peticiones iguales a la vez: una escribe y la otra repite.
    const racing = randomUUID();
    const results = await Promise.all([
      evaluate(coachA1, s1(), [ana], [first[0]!], "achieved", { clientRequestId: racing, achievedOn: "2026-11-01" }),
      evaluate(coachA1, s1(), [ana], [first[0]!], "achieved", { clientRequestId: racing, achievedOn: "2026-11-01" }),
    ]);
    expect(results.map((entry) => entry.replayed).sort()).toEqual([false, true]);
    let view = await getAthleteSkills({ actor: ownerA, athleteId: ana, query: { ...s1(), templateId: template.id } });
    let element = view.templates[0]!.levels[0]!.elements[0]!;
    expect(element.state).toMatchObject({ status: "achieved", achievedOn: "2026-11-01", evaluatedByName: "Entrenador/a" });

    // Volver a marcarlo conseguido sin fecha no cambia quién lo consiguió ni cuándo.
    expect(await evaluate(ownerA, s1(), [ana], [first[0]!], "achieved")).toMatchObject({ changed: 0, unchanged: 1 });
    // Quitar el logro vacía la fecha.
    await evaluate(ownerA, s1(), [ana], [first[0]!], "not_started");
    view = await getAthleteSkills({ actor: ownerA, athleteId: ana, query: { ...s1(), templateId: template.id } });
    element = view.templates[0]!.levels[0]!.elements[0]!;
    expect(element.state).toMatchObject({ status: "not_started", achievedOn: null });
    const stored = await db.execute(sql`
      select status, achieved_on from zaltyko.athlete_skill_progress
      where organization_id = ${a.organizationId}::uuid and athlete_id = ${ana}::uuid and element_id = ${first[0]}::uuid
    `);
    expect(stored.rows[0]).toMatchObject({ status: "not_started", achieved_on: null });

    // La fecha de un logro no puede ser futura.
    await expect(evaluate(ownerA, s1(), [ana], [first[0]!], "achieved", { achievedOn: "2099-01-01" })).rejects.toMatchObject({
      code: "INVALID_DATE_RANGE",
      status: 422,
    });
    const audit = await db.execute(sql`
      select count(*)::int as total from zaltyko.audit_log
      where organization_id = ${a.organizationId}::uuid and action = 'skill_progress.evaluated'
    `);
    expect(Number((audit.rows[0] as { total: number }).total)).toBeGreaterThanOrEqual(4);
  });

  it("solo evalúa a gimnastas vinculadas a la sede y activas, y aísla las academias", async () => {
    const [element] = levelElements(template, 0);
    // Bea solo está en S2: desde S1 no existe; su entrenador de S2 sí la evalúa.
    await expect(evaluate(ownerA, s1(), [bea], [element!], "in_progress")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await evaluate(coachA2, s2(), [bea], [element!], "in_progress")).toMatchObject({ changed: 1 });
    // Ana no está en S2 para el entrenador de S2.
    await expect(evaluate(coachA2, s2(), [ana], [element!], "in_progress")).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Entrenador de S1 fuera de S2.
    await expect(evaluate(coachA1, s2(), [bea], [element!], "in_progress")).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED" });
    // Carla tiene el grupo terminado: la dirección la ve, el entrenador no.
    await expect(evaluate(coachA1, s1(), [carla], [element!], "in_progress")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await evaluate(ownerA, s1(), [carla], [element!], "in_progress")).toMatchObject({ changed: 1 });
    // Eva está archivada: nadie escribe; el entrenador ni la ve.
    await expect(evaluate(ownerA, s1(), [eva], [element!], "in_progress")).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
      status: 409,
    });
    await expect(evaluate(coachA1, s1(), [eva], [element!], "in_progress")).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Una gimnasta de otra academia no existe aquí, y quien es de B no escribe en A.
    await expect(evaluate(ownerA, s1(), [zoe], [element!], "in_progress")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(evaluate(ownerB, s1(), [ana], [element!], "in_progress")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      evaluate(ownerB, { organizationId: b.organizationId, locationId: b.locationIds[0]! }, [zoe], [element!], "in_progress")
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Un elemento que no existe en la plantilla se rechaza sin escribir nada.
    const before = await count("athlete_skill_progress", a.organizationId);
    await expect(evaluate(ownerA, s1(), [ana], [element!, randomUUID()], "in_progress")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await count("athlete_skill_progress", a.organizationId)).toBe(before);
  });

  it("el paso de nivel exige orden y obligatorios conseguidos, y es idempotente", async () => {
    const [l1, l2, l3] = template.levels;
    // Con faltantes no se puede pasar.
    await expect(pass(ownerA, ana, l1!.id)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", status: 409 });
    // Fuera de orden tampoco, aunque el nivel esté completo.
    await evaluate(ownerA, s1(), [ana], l3!.elements.map((element) => element.id), "achieved");
    await expect(pass(ownerA, ana, l3!.id)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });

    // Consigue todo el primer nivel (también los opcionales) y avisa de «listo para pasar».
    await evaluate(coachA1, s1(), [ana], levelElements(template, 0), "achieved", { achievedOn: "2026-11-10" });
    const ready = await getAthleteSkills({ actor: coachA1, athleteId: ana, query: { ...s1(), templateId: template.id } });
    expect(ready.templates[0]).toMatchObject({ readyToPass: true, currentLevelId: l1!.id });

    const clientRequestId = randomUUID();
    const passed = await pass(coachA1, ana, l1!.id, s1(), { clientRequestId, passedOn: "2026-11-12" });
    expect(passed).toMatchObject({ replayed: false });
    expect(await pass(coachA1, ana, l1!.id, s1(), { clientRequestId, passedOn: "2026-11-12" })).toEqual({ ...passed, replayed: true });
    // Reutilizar la petición con otro nivel es un conflicto; superar dos veces el mismo, un error de estado.
    await expect(pass(coachA1, ana, l2!.id, s1(), { clientRequestId })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(pass(ownerA, ana, l1!.id)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    // El nivel siguiente tampoco se pasa mientras no esté completo, ni con una fecha futura.
    await expect(pass(ownerA, ana, l2!.id, s1(), { passedOn: "2099-01-01" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });

    const view = await getAthleteSkills({ actor: ownerA, athleteId: ana, query: { ...s1(), templateId: template.id } });
    const track = view.templates[0]!;
    expect(track.levels[0]).toMatchObject({ passed: { id: passed.id, passedOn: "2026-11-12", passedByName: "Entrenador/a" }, current: false });
    expect(track.currentLevelId).toBe(l2!.id);
    expect(track.readyToPass).toBe(false);
    expect(await count("athlete_level_passes", a.organizationId)).toBe(1);
  });

  it("lista un grupo y una sesión con las gimnastas vigentes y su progreso", async () => {
    const [l1] = template.levels;
    const group = await getGroupSkillRoster({ actor: ownerA, groupId: groupS1, query: { ...s1(), templateId: template.id } });
    expect(group.label).toBe("Base 3 GAF");
    // Ana y Dani: pertenencia abierta. Ni Carla (terminada) ni Eva (archivada).
    expect(group.athletes.map((entry) => entry.name)).toEqual(["Ana Niveles", "Dani Niveles"]);
    expect(group.template.levels).toHaveLength(4);
    const anaRow = group.athletes.find((entry) => entry.id === ana)!;
    expect(anaRow.passedLevelIds).toEqual([l1!.id]);
    expect(anaRow.currentLevelId).toBe(template.levels[1]!.id);
    const daniRow = group.athletes.find((entry) => entry.id === dani)!;
    expect(daniRow.passedLevelIds).toEqual([]);
    expect(daniRow.readyToPass).toBe(false);
    expect(Object.keys(daniRow.statuses).length).toBeGreaterThan(0);
    expect(group.canWrite).toBe(true);
    expect(group.availableTemplates.map((entry) => entry.id)).toContain(template.id);

    // La sesión de S1 participa por el grupo vinculado a su clase.
    const session = await getSessionSkillRoster({ actor: coachA1, sessionId: sessionS1, query: { ...s1(), templateId: template.id } });
    expect(session.label).toBe("CI Base 3");
    expect(session.athletes.map((entry) => entry.name)).toEqual(["Ana Niveles", "Dani Niveles"]);

    // Otra sede, otra academia o un id ajeno: no existen.
    await expect(getGroupSkillRoster({ actor: coachA2, groupId: groupS1, query: { ...s2(), templateId: template.id } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getGroupSkillRoster({ actor: coachA2, groupId: groupS2, query: { ...s2(), templateId: template.id } })).resolves.toMatchObject({ athletes: [{ name: "Bea Niveles" }] });
    await expect(getSessionSkillRoster({ actor: coachA2, sessionId: sessionS1, query: { ...s2(), templateId: template.id } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      getGroupSkillRoster({
        actor: ownerB,
        groupId: groupS1,
        query: { organizationId: b.organizationId, locationId: b.locationIds[0]!, templateId: template.id },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getGroupSkillRoster({ actor: ownerA, groupId: groupS1, query: { ...s1(), templateId: randomUUID() } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("emite el diploma del paso de nivel con los elementos conseguidos y solo a quien puede ver a la gimnasta", async () => {
    const view = await getAthleteSkills({ actor: ownerA, athleteId: ana, query: s1() });
    const passId = view.templates[0]!.levels[0]!.passed!.id;
    const diploma = await getLevelPassDiploma({ actor: coachA1, athleteId: ana, passId, query: s1() });
    expect(diploma).toMatchObject({
      passId,
      athleteName: "Ana Niveles",
      academyName: "CI niveles A",
      templateName: template.name,
      levelName: "Iniciación",
      levelPosition: 1,
      passedOn: "2026-11-12",
      discipline: "artistic_female",
    });
    const required = template.levels[0]!.elements.filter((element) => element.required).length;
    expect(diploma.achievements).toHaveLength(required);
    // Otra sede, otra academia, otra gimnasta con ese id: 404.
    await expect(getLevelPassDiploma({ actor: coachA2, athleteId: ana, passId, query: s2() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getLevelPassDiploma({ actor: ownerA, athleteId: dani, passId, query: s1() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      getLevelPassDiploma({
        actor: ownerB,
        athleteId: zoe,
        passId,
        query: { organizationId: b.organizationId, locationId: b.locationIds[0]! },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("edita la estructura sin perder el progreso: lo que se quita se archiva", async () => {
    const view = await getSkillTemplate({ actor: ownerA, templateId: template.id, query: s1() });
    const [l1, l2] = view.levels;
    const removed = l1!.elements[0]!;
    const levels = [
      {
        id: l1!.id,
        name: "Iniciación renombrada",
        elements: [
          ...l1!.elements.slice(1),
          { name: "Elemento nuevo de suelo", apparatus: "floor", required: true },
        ],
      },
      { id: l2!.id, name: l2!.name, elements: l2!.elements },
    ];
    const base = { ...s1(), name: view.name, levels };
    // Una revisión vieja se rechaza; un aparato de otra disciplina, también.
    await expect(
      saveSkillTemplate({ actor: ownerA, templateId: template.id, command: { ...base, expectedRevision: view.revision + 5 } })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    await expect(
      saveSkillTemplate({
        actor: ownerA,
        templateId: template.id,
        command: {
          ...base,
          expectedRevision: view.revision,
          levels: [{ id: l1!.id, name: "X", elements: [{ name: "Anillas", apparatus: "rings" }] }],
        },
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    // Un id de elemento ajeno a la plantilla no se acepta.
    await expect(
      saveSkillTemplate({
        actor: ownerA,
        templateId: template.id,
        command: {
          ...base,
          expectedRevision: view.revision,
          levels: [{ id: l1!.id, name: "X", elements: [{ id: randomUUID(), name: "Ajeno" }] }],
        },
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION" });

    const saved = await saveSkillTemplate({
      actor: managerA1,
      templateId: template.id,
      command: { ...base, expectedRevision: view.revision },
    });
    expect(saved).toMatchObject({ revision: view.revision + 1, replayed: false });
    const after = await getSkillTemplate({ actor: ownerA, templateId: template.id, query: s1() });
    expect(after.levels).toHaveLength(2);
    expect(after.levels[0]!.name).toBe("Iniciación renombrada");
    expect(after.levels[0]!.elements.map((element) => element.id)).not.toContain(removed.id);
    expect(after.levels[0]!.elements.at(-1)!.name).toBe("Elemento nuevo de suelo");

    // Los niveles 3 y 4 y el elemento quitado se archivaron; ninguna marca ni paso se borró.
    const archived = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.skill_levels where organization_id = ${a.organizationId}::uuid and template_id = ${template.id}::uuid and archived_at is not null) as levels,
        (select count(*)::int from zaltyko.skill_elements where organization_id = ${a.organizationId}::uuid and id = ${removed.id}::uuid and archived_at is not null) as element
    `);
    expect(archived.rows[0]).toMatchObject({ levels: 2, element: 1 });
    expect(await count("athlete_level_passes", a.organizationId)).toBe(1);
    // El diploma del nivel superado sigue disponible con su nombre actual.
    const skills = await getAthleteSkills({ actor: ownerA, athleteId: ana, query: { ...s1(), templateId: template.id } });
    expect(skills.templates[0]!.levels[0]!.passed).not.toBeNull();
    template = after;
  });

  it("archiva una plantilla: deja de ofrecerse y de evaluarse, y se puede restaurar", async () => {
    const created = await createStarter(ownerA, { name: "GAF para archivar" });
    const view = await getSkillTemplate({ actor: ownerA, templateId: created.id, query: s1() });
    const levels = view.levels.map((level) => ({ id: level.id, name: level.name, elements: level.elements }));
    const archivedResult = await saveSkillTemplate({
      actor: ownerA,
      templateId: created.id,
      command: { ...s1(), expectedRevision: view.revision, name: view.name, levels, archived: true },
    });
    expect((await listSkillTemplates({ actor: ownerA, query: s1() })).templates.map((entry) => entry.id)).not.toContain(created.id);
    const withArchived = await listSkillTemplates({ actor: ownerA, query: { ...s1(), includeArchived: "true" } });
    expect(withArchived.templates.find((entry) => entry.id === created.id)).toMatchObject({ archived: true });
    await expect(
      evaluateSkills({
        actor: ownerA,
        command: {
          ...s1(),
          clientRequestId: randomUUID(),
          templateId: created.id,
          athleteIds: [ana],
          elementIds: [view.levels[0]!.elements[0]!.id],
          status: "in_progress",
        },
      })
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const restored = await saveSkillTemplate({
      actor: ownerA,
      templateId: created.id,
      command: { ...s1(), expectedRevision: archivedResult.revision, name: view.name, levels, archived: false },
    });
    expect(restored.revision).toBe(archivedResult.revision + 1);
    expect((await listSkillTemplates({ actor: ownerA, query: s1() })).templates.map((entry) => entry.id)).toContain(created.id);
  });

  it("las familias leen solo lo de su gimnasta, sin nombres del equipo, y solo con la función encendida", async () => {
    const userF = randomUUID();
    const strangerUser = randomUUID();
    for (const id of [userF, strangerUser]) {
      await db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`ci-skills-fam-${id}@example.invalid`})`);
    }
    const guardianId = randomUUID();
    const familyId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (${guardianId}::uuid, ${a.organizationId}::uuid, 'Tutor', 'Niveles')
    `);
    await db.execute(sql`
      insert into zaltyko.guardians (id, organization_id, person_id, auth_user_id, is_active)
      values (${guardianId}::uuid, ${a.organizationId}::uuid, ${guardianId}::uuid, ${userF}::uuid, true)
    `);
    await db.execute(sql`
      insert into zaltyko.families (id, organization_id, is_active) values (${familyId}::uuid, ${a.organizationId}::uuid, true)
    `);
    await db.execute(sql`
      insert into zaltyko.family_guardians (organization_id, family_id, guardian_id, relationship, can_view_athletes, is_active)
      values (${a.organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid, 'parent', true, true)
    `);
    await db.execute(sql`
      insert into zaltyko.family_members (organization_id, family_id, athlete_id, relationship, starts_on)
      values (${a.organizationId}::uuid, ${familyId}::uuid, ${ana}::uuid, 'other', '2026-09-01')
    `);

    const view = await getFamilySkills({ userId: userF, athleteId: ana });
    expect(view).not.toBeNull();
    expect(view!).toMatchObject({ academyName: "CI niveles A" });
    expect(view!.athleteName).toContain("Ana");
    expect(view!.templates).toHaveLength(1);
    const family = view!.templates[0]!;
    expect(family.template.id).toBe(template.id);
    expect(family.levels[0]!.passed).toMatchObject({ passedOn: "2026-11-12", passedByName: null });
    for (const level of family.levels) {
      for (const element of level.elements) {
        expect(element.state.evaluatedByName).toBeNull();
        expect(element.state.evaluatedAt).toBeNull();
      }
    }
    expect(JSON.stringify(view)).not.toContain("Entrenador/a");

    // Diploma: el de su gimnasta sí; el de otra gimnasta o ajeno, no.
    const passId = family.levels[0]!.passed!.id;
    expect(await getFamilyDiploma({ userId: userF, athleteId: ana, passId })).toMatchObject({ passId, levelName: "Iniciación renombrada" });
    expect(await getFamilyDiploma({ userId: userF, athleteId: ana, passId: randomUUID() })).toBeNull();
    // Dani no es de esta familia; una cuenta sin vínculo tampoco ve a Ana.
    await expect(getFamilySkills({ userId: userF, athleteId: dani })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getFamilySkills({ userId: strangerUser, athleteId: ana })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getFamilyDiploma({ userId: strangerUser, athleteId: ana, passId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Con la bandera apagada no hay sección: null, sin leer nada.
    setFlag(false);
    expect(await getFamilySkills({ userId: userF, athleteId: ana })).toBeNull();
    expect(await getFamilyDiploma({ userId: userF, athleteId: ana, passId })).toBeNull();
    setFlag(true);
  });

  it("repetir una petición con otros datos es un conflicto, no una repetición", async () => {
    const [element] = levelElements(template, 1);
    const clientRequestId = randomUUID();
    await evaluate(ownerA, s1(), [ana], [element!], "in_progress", { clientRequestId });
    await expect(
      evaluate(ownerA, s1(), [ana], [element!], "achieved", { clientRequestId })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(
      evaluate(ownerA, s1(), [ana, dani], [element!], "in_progress", { clientRequestId })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    // Los mismos datos, sí: es una repetición.
    expect(await evaluate(ownerA, s1(), [ana], [element!], "in_progress", { clientRequestId })).toMatchObject({ replayed: true });
  });

  it("dos evaluaciones distintas de la misma gimnasta a la vez no fallan con un error de base de datos", async () => {
    const [element] = levelElements(template, 1).slice(-1);
    const results = await Promise.allSettled([
      evaluate(coachA1, s1(), [dani], [element!], "in_progress"),
      evaluate(ownerA, s1(), [dani], [element!], "achieved"),
      evaluate(managerA1, s1(), [dani], [element!], "in_progress"),
    ]);
    // Se serializan: todas terminan bien, o la perdedora recibe un 409 limpio.
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    }
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    const stored = await db.execute(sql`
      select count(*)::int as total, min(status) as status, max(revision)::int as revision
      from zaltyko.athlete_skill_progress
      where organization_id = ${a.organizationId}::uuid and athlete_id = ${dani}::uuid and element_id = ${element}::uuid
    `);
    expect(stored.rows[0]).toMatchObject({ total: 1 });
    expect(["in_progress", "achieved"]).toContain((stored.rows[0] as { status: string }).status);
  });

  it("dos pasos de nivel distintos de la misma gimnasta a la vez: uno se registra y el otro recibe «ya superado»", async () => {
    const [l1] = template.levels;
    await evaluate(ownerA, s1(), [dani], levelElements(template, 0), "achieved", { achievedOn: "2026-11-10" });
    const before = await count("athlete_level_passes", a.organizationId);
    const results = await Promise.allSettled([pass(coachA1, dani, l1!.id), pass(ownerA, dani, l1!.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "INVALID_STATE_TRANSITION", status: 409 });
    expect(await count("athlete_level_passes", a.organizationId)).toBe(before + 1);
  });

  it("dar de baja a la evaluadora no bloquea ni borra el historial: queda sin autoría", async () => {
    const leaver = await member(a.organizationId, "coach", "selected", [a.locationIds[0]!], "leaver");
    const element = levelElements(template, 1).at(-1)!;
    await evaluate(leaver, s1(), [ana], [element], "in_progress");
    await db.execute(sql`delete from zaltyko.member_location_scopes where organization_id = ${a.organizationId}::uuid and member_id = ${leaver.memberId}::uuid`);
    await db.execute(sql`delete from zaltyko.organization_members where organization_id = ${a.organizationId}::uuid and id = ${leaver.memberId}::uuid`);
    const stored = await db.execute(sql`
      select evaluated_by_member_id from zaltyko.athlete_skill_progress
      where organization_id = ${a.organizationId}::uuid and athlete_id = ${ana}::uuid and element_id = ${element}::uuid
    `);
    expect((stored.rows[0] as { evaluated_by_member_id: string | null }).evaluated_by_member_id).toBeNull();
    const view = await getAthleteSkills({ actor: ownerA, athleteId: ana, query: { ...s1(), templateId: template.id } });
    const shown = view.templates[0]!.levels[1]!.elements.find((entry) => entry.id === element)!;
    expect(shown.state).toMatchObject({ status: "in_progress", evaluatedByName: null });
  });
});
