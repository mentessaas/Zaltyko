import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";

import { runEveryStatement } from "./helpers/element-library-candidate";

/**
 * Evento de consulta a la biblioteca (ADR-0029 §11) sobre PostgreSQL desechable
 * de GitHub. Instala la candidata del uso habitual solo si falta y después la
 * de este evento, solo aquí y después de todos los guardas, y lo retira todo al
 * terminar; nunca en un proyecto enlazado ni con credenciales externas. Escribe
 * con SQL directo (no con recordUsageEvent) para probar la restricción de la
 * tabla y no la lista del dominio: sin la candidata el evento se rechaza; con
 * ella se guarda para el equipo y no para una familia; reinstalar aborta en el
 * preflight; la vuelta atrás comentada deja la restricción como estaba.
 */
const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";
const describeDisposablePg = describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1");

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

const candidate = (name: string) => readFileSync(resolve(process.cwd(), "docs/deployment/candidates", name), "utf8");
const HABITUAL_USE = "20261114130000_habitual_use_candidate.sql";
const USAGE_EVENT = "20261119121500_element_library_usage_event_candidate.sql";

const REQUIRES_TABLE =
  "Element library usage event candidate requires public.usage_events from the habitual use candidate (20261114130000) installed first";
const REQUIRES_SHAPE =
  "Element library usage event candidate requires usage_events_event_name_check exactly as the habitual use candidate (20261114130000) installs it; inspect existing schema before promotion";

/** pg_get_constraintdef de la restricción antes y después de la candidata. */
const BEFORE = "CHECK ((event_name = ANY (ARRAY['staff_visit'::text, 'family_portal_view'::text])))";
const AFTER =
  "CHECK ((event_name = ANY (ARRAY['staff_visit'::text, 'family_portal_view'::text, 'element_library_view'::text])))";

type PgFailure = { code?: string; message?: string; constraint?: string; cause?: PgFailure } | null;

/** Error de PostgreSQL de una sentencia que debe fallar (Drizzle lo envuelve en `cause`). */
async function failureOf(statement: Promise<unknown>): Promise<PgFailure> {
  const failure = (await statement.then(
    () => null,
    (error) => error
  )) as PgFailure;
  return failure?.cause ?? failure;
}

/**
 * La candidata abre su propia transacción (`begin; … commit;`). Si falla a
 * mitad, la conexión queda en una transacción abortada; por eso se ejecuta en
 * una conexión propia que se cierra al terminar y nunca vuelve al pool de
 * `db`. Solo se llama después de assertDisposableTarget().
 */
async function runOnOwnConnection(text: string): Promise<void> {
  const client = new Client({ connectionString: process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

/** Bloque de vuelta atrás comentado de la candidata, sin los `-- `. */
function rollbackBlock(text: string): string {
  const match = /^-- >>> vuelta atrás\n([\s\S]*?)^-- <<< vuelta atrás$/m.exec(text);
  if (!match) throw new Error("La candidata no tiene bloque de vuelta atrás");
  return match[1]!
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      if (!line.startsWith("-- ")) throw new Error(`Línea de vuelta atrás sin comentar: ${line}`);
      return line.slice(3);
    })
    .join("\n");
}

async function usageEventsPresent(): Promise<boolean> {
  const result = await db.execute(sql`select to_regclass('public.usage_events') is not null as present`);
  return (result.rows[0] as { present: boolean }).present;
}

/** Definiciones de todas las restricciones de la tabla, por nombre. */
async function constraints(): Promise<Record<string, string>> {
  const result = await db.execute(sql`
    select conname::text as name, pg_get_constraintdef(oid) as definition
      from pg_constraint
     where conrelid = to_regclass('public.usage_events')
     order by conname::text
  `);
  return Object.fromEntries(
    (result.rows as Array<{ name: string; definition: string }>).map((row) => [row.name, row.definition])
  );
}

describeDisposablePg("evento de consulta a la biblioteca sobre PostgreSQL desechable", () => {
  let installedHere = false;
  let withoutTable: PgFailure = null;
  let organizationId: string | null = null;
  let original: Record<string, string> = {};

  const insertEvent = (eventName: string, actorRole: string) =>
    db.execute(sql`
      insert into public.usage_events (organization_id, event_name, actor_role, occurred_on)
      values (${organizationId}::uuid, ${eventName}, ${actorRole}, current_date)
    `);

  const eventCount = async (eventName: string) => {
    const result = await db.execute(sql`
      select count(*)::int as total from public.usage_events
       where organization_id = ${organizationId}::uuid and event_name = ${eventName}
    `);
    return (result.rows[0] as { total: number }).total;
  };

  beforeAll(async () => {
    assertDisposableTarget();
    // La base de CI solo tiene supabase/migrations: el uso habitual va primero,
    // y solo si falta. Antes se comprueba que esta candidata aborta sin él.
    if (!(await usageEventsPresent())) {
      withoutTable = await failureOf(runOnOwnConnection(candidate(USAGE_EVENT)));
      await db.execute(sql.raw(candidate(HABITUAL_USE)));
      installedHere = true;
    }
    original = await constraints();
    organizationId = randomUUID();
    await db.execute(
      sql`insert into zaltyko.organizations (id, name, default_timezone) values (${organizationId}::uuid, ${`CI biblioteca uso ${organizationId}`}, 'Europe/Madrid')`
    );
  }, 60_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    // La academia de prueba se queda (su historial de condiciones no admite
    // borrado). Primero se retira lo instalado aquí; las filas de prueba, al final.
    if (installedHere) {
      // Vuelta atrás documentada en la candidata del uso habitual.
      await runEveryStatement([
        "drop index if exists zaltyko.sessions_starts_at_idx",
        "drop index if exists zaltyko.sessions_ends_at_idx",
        "drop table if exists public.usage_events",
      ]);
      return;
    }
    try {
      if ((await constraints()).usage_events_event_name_check !== original.usage_events_event_name_check) {
        // Por si un test falló antes de la vuelta atrás: la tabla ajena queda como estaba.
        await runOnOwnConnection(rollbackBlock(candidate(USAGE_EVENT)));
      }
    } finally {
      if (organizationId) {
        await db.execute(sql`delete from public.usage_events where organization_id = ${organizationId}::uuid`);
      }
    }
  }, 60_000);

  it("sin la candidata, la tabla rechaza element_library_view y sigue aceptando los otros eventos", async () => {
    if (installedHere) {
      expect(withoutTable?.code).toBe("P0001");
      expect(withoutTable?.message).toBe(REQUIRES_TABLE);
    }
    expect(original.usage_events_event_name_check).toBe(BEFORE);

    const rejected = await failureOf(insertEvent("element_library_view", "coach"));
    expect(rejected?.code).toBe("23514");
    expect(rejected?.constraint).toBe("usage_events_event_name_check");
    expect(await eventCount("element_library_view")).toBe(0);

    await insertEvent("staff_visit", "coach");
    expect(await eventCount("staff_visit")).toBe(1);
  });

  it("con la candidata, el evento se guarda para el equipo y nunca para una familia", async () => {
    await runOnOwnConnection(candidate(USAGE_EVENT));
    const after = await constraints();
    expect(after.usage_events_event_name_check).toBe(AFTER);
    // Las demás restricciones, incluida la regla de rol, no cambian.
    expect({ ...after, usage_events_event_name_check: BEFORE }).toEqual(original);

    for (const role of ["owner", "manager", "admin", "coach"]) await insertEvent("element_library_view", role);
    expect(await eventCount("element_library_view")).toBe(4);

    const family = await failureOf(insertEvent("element_library_view", "family"));
    expect(family?.code).toBe("23514");
    expect(family?.constraint).toBe("usage_events_role_event_check");
    expect(await eventCount("element_library_view")).toBe(4);
    // Lo que ya había sigue ahí.
    expect(await eventCount("staff_visit")).toBe(1);
  });

  it("reinstalar la candidata aborta en el preflight sin cambiar nada", async () => {
    const again = await failureOf(runOnOwnConnection(candidate(USAGE_EVENT)));
    expect(again?.code).toBe("P0001");
    expect(again?.message).toBe(REQUIRES_SHAPE);
    expect((await constraints()).usage_events_event_name_check).toBe(AFTER);
    expect(await eventCount("element_library_view")).toBe(4);
  });

  it("la vuelta atrás comentada deja la restricción como la instaló el uso habitual", async () => {
    await runOnOwnConnection(rollbackBlock(candidate(USAGE_EVENT)));
    expect(await constraints()).toEqual(original);
    expect(await eventCount("element_library_view")).toBe(0);
    expect(await eventCount("staff_visit")).toBe(1);
    const rejected = await failureOf(insertEvent("element_library_view", "coach"));
    expect(rejected?.constraint).toBe("usage_events_event_name_check");
  });
});
