import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { bootstrapOrganization } from "@/modules/organizations/application/bootstrap-organization";

/**
 * Alta abierta a cualquier país en PostgreSQL desechable de GitHub. Instala el
 * candidato `20261112120000_general_market_identity_candidate.sql` solo aquí,
 * después de los guardas, y retira su función al terminar; nunca en un
 * proyecto enlazado ni con credenciales externas. Cubre: alta dormida sin el
 * candidato (422, sin escrituras), rechazo de reinstalación, ACL y forma de la
 * función, rechazo de ES/MX y de disciplinas o códigos no válidos, alta de un
 * país del nivel general con un perfil de identidad vacío reutilizado por otra
 * academia, altas simultáneas en un país nuevo y validación de moneda y zona.
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

const FUNCTION_SIGNATURE =
  "zaltyko_domain_private.ensure_general_identity_sport_profile(text,text)";
const candidate = () =>
  readFileSync(
    resolve(process.cwd(), "docs/deployment/candidates/20261112120000_general_market_identity_candidate.sql"),
    "utf8"
  );

async function failure(promise: Promise<unknown>) {
  return (await promise.then(
    () => null,
    (error) => error
  )) as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
}

async function expectPgCode(promise: Promise<unknown>, code: string) {
  const error = await failure(promise);
  expect(error).not.toBeNull();
  expect(error?.cause?.code ?? error?.code).toBe(code);
}

async function owner(label: string) {
  const userId = randomUUID();
  await db.execute(
    sql`insert into auth.users (id, email) values (${userId}::uuid, ${`ci-general-${label}-${userId}@example.invalid`})`
  );
  return userId;
}

function command(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    userId,
    organizationName: "Club sintético internacional",
    locationName: "Sede sintética",
    countryCode: "FR",
    defaultCurrency: "EUR" as const,
    timezone: "Europe/Paris",
    primaryDiscipline: "artistic" as const,
    additionalDisciplines: ["rhythmic" as const],
    complementaryActivities: [],
    idempotencyKey: `ci-general-${randomUUID()}`,
    ...overrides,
  };
}

async function userSnapshot(userId: string) {
  return (
    await db.execute(sql`select
      (select count(*)::int from zaltyko.organization_members where user_id = ${userId}::uuid) as members,
      (select count(*)::int from zaltyko.organization_bootstrap_commands where user_id = ${userId}::uuid) as commands`)
  ).rows[0];
}

async function countryProfiles(countryCode: string) {
  return (
    await db.execute(sql`select discipline_key, federation_code, profile_version, status::text as status,
        configuration_schema_version, configuration
      from zaltyko.sport_profiles where country_code = ${countryCode}
      order by discipline_key, profile_version`)
  ).rows;
}

async function functionInstalled() {
  const result = await db.execute(
    sql`select to_regprocedure(${FUNCTION_SIGNATURE}) is not null as installed`
  );
  return (result.rows[0] as { installed: boolean }).installed;
}

describe.skipIf(!disposablePgEnabled)("alta de cualquier país en PostgreSQL desechable", () => {
  beforeAll(() => {
    assertDisposableTarget();
  });

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    // Vuelve al estado dormido para el resto de suites de la base compartida.
    await db.execute(sql.raw(`drop function if exists ${FUNCTION_SIGNATURE}`));
  });

  it("sin el candidato responde 422 claro y no escribe nada", async () => {
    expect(await functionInstalled()).toBe(false);
    const userId = await owner("dormant");
    const before = await userSnapshot(userId);

    const error = await failure(bootstrapOrganization(command(userId)));
    expect(error).toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 422,
      details: { reason: "general-market-onboarding-not-enabled" },
    });
    expect(error?.message).toContain("No se ha creado nada");
    expect(await userSnapshot(userId)).toEqual(before);
    expect(await countryProfiles("FR")).toEqual([]);
  });

  it("instala solo la función revisada, sin ACL de clientes, y se niega a reinstalarse", async () => {
    // Fuera de ES y MX: otra suite puede instalar a la vez el candidato MX.
    const profilesBefore = await db.execute(
      sql`select count(*)::int as count from zaltyko.sport_profiles where country_code not in ('ES', 'MX')`
    );
    await db.execute(sql.raw(candidate()));
    expect(await functionInstalled()).toBe(true);
    const profilesAfter = await db.execute(
      sql`select count(*)::int as count from zaltyko.sport_profiles where country_code not in ('ES', 'MX')`
    );
    // No siembra países por adelantado.
    expect(profilesAfter.rows).toEqual(profilesBefore.rows);

    const shape = await db.execute(sql`select p.prosecdef, p.proconfig,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
        exists (
          select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        ) as public_execute
      from pg_proc p where p.oid = to_regprocedure(${FUNCTION_SIGNATURE})`);
    expect(shape.rows).toEqual([
      {
        prosecdef: false,
        proconfig: ['search_path=""'],
        anon_execute: false,
        authenticated_execute: false,
        service_execute: true,
        public_execute: false,
      },
    ]);

    const reinstall = await failure(db.execute(sql.raw(candidate())));
    expect(reinstall).not.toBeNull();
    expect((reinstall?.cause ?? reinstall)?.code).toBe("P0001");
    expect(await functionInstalled()).toBe(true);
  });

  it("no toca perfiles de ES ni MX y rechaza disciplinas o códigos no válidos", async () => {
    // Solo ES: el candidato MX de otra suite puede añadir filas MX en paralelo.
    const before = await db.execute(
      sql`select count(*)::int as count from zaltyko.sport_profiles where country_code = 'ES'`
    );
    for (const [country, discipline] of [
      ["ES", "artistic"],
      ["MX", "rhythmic"],
      ["FR", "acrobatic"],
      ["fr", "artistic"],
      ["FRA", "artistic"],
    ] as const) {
      await expectPgCode(
        db.execute(
          sql`select zaltyko_domain_private.ensure_general_identity_sport_profile(${country}, ${discipline})`
        ),
        "22023"
      );
    }
    const after = await db.execute(
      sql`select count(*)::int as count from zaltyko.sport_profiles where country_code = 'ES'`
    );
    expect(after.rows).toEqual(before.rows);
    expect(await countryProfiles("FR")).toEqual([]);
  });

  it("da de alta una academia francesa con perfiles de identidad vacíos y la reconoce en el reintento", async () => {
    const userId = await owner("fr");
    const request = command(userId);
    const first = await bootstrapOrganization(request);

    expect(first.administrativeMarket).toEqual({
      countryCode: "FR",
      defaultCurrency: "EUR",
      timezone: "Europe/Paris",
    });
    expect(first.sportCoverage.mode).toBe("general_country_identity");
    expect(await bootstrapOrganization(request)).toEqual(first);
    expect(await userSnapshot(userId)).toEqual({ members: 1, commands: 1 });

    expect(await countryProfiles("FR")).toEqual([
      {
        discipline_key: "artistic",
        federation_code: "unconfigured",
        profile_version: "identity-v1",
        status: "identity_only",
        configuration_schema_version: 1,
        configuration: {},
      },
      {
        discipline_key: "rhythmic",
        federation_code: "unconfigured",
        profile_version: "identity-v1",
        status: "identity_only",
        configuration_schema_version: 1,
        configuration: {},
      },
    ]);
    const data = await db.execute(sql`select o.country_code, o.default_currency, l.timezone,
        (select count(*)::int from zaltyko.programs p where p.organization_id = o.id) as programs,
        (select array_agg(sp.country_code || ':' || sp.discipline_key order by sp.discipline_key)
           from zaltyko.organization_sports os
           join zaltyko.sport_profiles sp on sp.id = os.sport_profile_id
          where os.organization_id = o.id) as identities
      from zaltyko.organizations o
      join zaltyko.locations l on l.organization_id = o.id
      where o.id = ${first.organizationId}::uuid`);
    expect(data.rows).toEqual([
      {
        country_code: "FR",
        default_currency: "EUR",
        timezone: "Europe/Paris",
        programs: 2,
        identities: ["FR:artistic", "FR:rhythmic"],
      },
    ]);

    // Otra academia francesa reutiliza los mismos perfiles.
    const second = await bootstrapOrganization(
      command(await owner("fr-2"), { additionalDisciplines: [], defaultCurrency: "MXN" })
    );
    expect(second.administrativeMarket.defaultCurrency).toBe("MXN");
    expect(await countryProfiles("FR")).toHaveLength(2);
  });

  it("dos altas simultáneas en un país nuevo crean un único perfil por disciplina", async () => {
    const [firstUser, secondUser] = await Promise.all([owner("pt-1"), owner("pt-2")]);
    const portugal = { countryCode: "PT", timezone: "Atlantic/Azores", additionalDisciplines: [] };
    const results = await Promise.all([
      bootstrapOrganization(command(firstUser, portugal)),
      bootstrapOrganization(command(secondUser, portugal)),
    ]);
    expect(results.map((result) => result.administrativeMarket.countryCode)).toEqual(["PT", "PT"]);
    expect(await countryProfiles("PT")).toEqual([
      {
        discipline_key: "artistic",
        federation_code: "unconfigured",
        profile_version: "identity-v1",
        status: "identity_only",
        configuration_schema_version: 1,
        configuration: {},
      },
    ]);
  });

  it("no modifica un perfil del país con otra forma y el alta falla cerrada con 422", async () => {
    await db.execute(sql`insert into zaltyko.sport_profiles
      (country_code, discipline_key, federation_code, profile_version, status, configuration_schema_version, configuration)
      values ('BE', 'artistic', 'unconfigured', 'identity-v1', 'draft', 1, '{"rules": ["ci"]}'::jsonb)`);
    const userId = await owner("be");
    const before = await userSnapshot(userId);

    await expect(
      bootstrapOrganization(
        command(userId, { countryCode: "BE", timezone: "Europe/Brussels", additionalDisciplines: [] })
      )
    ).rejects.toMatchObject({
      code: "INVALID_RELATION",
      status: 422,
      details: { reason: "general-market-identity-profiles-required" },
    });
    expect(await userSnapshot(userId)).toEqual(before);
    expect(await countryProfiles("BE")).toEqual([
      {
        discipline_key: "artistic",
        federation_code: "unconfigured",
        profile_version: "identity-v1",
        status: "draft",
        configuration_schema_version: 1,
        configuration: { rules: ["ci"] },
      },
    ]);
  });

  it("exige moneda soportada y una zona del país antes de escribir nada", async () => {
    const userId = await owner("ar");
    const before = await userSnapshot(userId);
    const argentina = { countryCode: "AR", timezone: "America/Argentina/Cordoba" };

    await expect(
      bootstrapOrganization(command(userId, { ...argentina, defaultCurrency: undefined }))
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    await expect(
      bootstrapOrganization(command(userId, { ...argentina, timezone: undefined }))
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    await expect(
      bootstrapOrganization(command(userId, { ...argentina, timezone: "Europe/Madrid" }))
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });
    await expect(
      bootstrapOrganization(command(userId, { ...argentina, countryCode: "ZZ" }))
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 422 });

    expect(await userSnapshot(userId)).toEqual(before);
    expect(await countryProfiles("AR")).toEqual([]);
  });
});
