import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { Pool } from "pg";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOCAL_ONLY = "ZALTYKO_OPERATIONAL_SUMMARY_LOCAL";
const ID = {
  org: "71000000-0000-4000-8000-000000000001",
  rivalOrg: "72000000-0000-4000-8000-000000000001",
  ownerUser: "71000000-0000-4000-8000-000000000011",
  managerUser: "71000000-0000-4000-8000-000000000012",
  ownerMember: "71000000-0000-4000-8000-000000000021",
  managerMember: "71000000-0000-4000-8000-000000000022",
  madrid: "71000000-0000-4000-8000-000000000031",
  pacific: "71000000-0000-4000-8000-000000000032",
  rivalLocation: "72000000-0000-4000-8000-000000000031",
  athlete: "71000000-0000-4000-8000-000000000041",
  inactiveAthlete: "71000000-0000-4000-8000-000000000042",
  rivalAthlete: "72000000-0000-4000-8000-000000000041",
  madridGroup: "71000000-0000-4000-8000-000000000051",
  pacificGroup: "71000000-0000-4000-8000-000000000052",
  rivalGroup: "72000000-0000-4000-8000-000000000051",
} as const;

function run(command: string, args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} falló (${result.status}): ${result.stderr || result.stdout}`
    );
  }
  return result.stdout.trim();
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

function localPgUrl(user: string, port: number): string {
  return `postgresql://${user}@127.0.0.1:${port}/postgres`;
}

async function createFixture(pool: Pool): Promise<void> {
  await pool.query(`
    create schema zaltyko;
    create table zaltyko.organizations (
      id uuid primary key, name text not null, default_currency text not null,
      default_timezone text not null
    );
    create table zaltyko.organization_members (
      id uuid primary key, organization_id uuid not null, user_id uuid not null,
      role text not null, status text not null, location_scope_mode text not null
    );
    create table zaltyko.locations (
      id uuid primary key, organization_id uuid not null, name text not null,
      timezone text not null
    );
    create table zaltyko.member_location_scopes (
      organization_id uuid not null, member_id uuid not null, location_id uuid not null
    );
    create table zaltyko.groups (
      id uuid primary key, organization_id uuid not null, location_id uuid not null,
      status text not null
    );
    create table zaltyko.athletes (
      id uuid primary key, organization_id uuid not null, is_active boolean not null
    );
    create table zaltyko.group_memberships (
      id uuid primary key, organization_id uuid not null, group_id uuid not null,
      athlete_id uuid not null, status text not null, starts_on date not null,
      ends_on date
    );
    create table zaltyko.sessions (
      id uuid primary key, organization_id uuid not null, location_id uuid not null,
      starts_at timestamptz not null
    );
    create table zaltyko.attendance_records (
      id uuid primary key, organization_id uuid not null, location_id uuid not null,
      session_id uuid not null
    );
    create table zaltyko.payments (
      id uuid primary key, organization_id uuid not null, location_id uuid,
      status text not null, amount_cents bigint not null, currency text not null,
      received_at timestamptz not null
    );

    insert into zaltyko.organizations values
      ('${ID.org}', 'Academia de prueba', 'EUR', 'Europe/Madrid'),
      ('${ID.rivalOrg}', 'Academia adversaria', 'EUR', 'Europe/Madrid');
    insert into zaltyko.locations values
      ('${ID.madrid}', '${ID.org}', 'Sede Madrid', 'Europe/Madrid'),
      ('${ID.pacific}', '${ID.org}', 'Sede Pacífico', 'America/Los_Angeles'),
      ('${ID.rivalLocation}', '${ID.rivalOrg}', 'Sede ajena', 'Europe/Madrid');
    insert into zaltyko.organization_members values
      ('${ID.ownerMember}', '${ID.org}', '${ID.ownerUser}', 'owner', 'active', 'all'),
      ('${ID.managerMember}', '${ID.org}', '${ID.managerUser}', 'manager', 'active', 'selected');
    insert into zaltyko.member_location_scopes values
      ('${ID.org}', '${ID.managerMember}', '${ID.madrid}');

    insert into zaltyko.groups values
      ('${ID.madridGroup}', '${ID.org}', '${ID.madrid}', 'active'),
      ('${ID.pacificGroup}', '${ID.org}', '${ID.pacific}', 'active'),
      ('${ID.rivalGroup}', '${ID.rivalOrg}', '${ID.rivalLocation}', 'active');
    insert into zaltyko.athletes values
      ('${ID.athlete}', '${ID.org}', true),
      ('${ID.inactiveAthlete}', '${ID.org}', false),
      ('${ID.rivalAthlete}', '${ID.rivalOrg}', true);
    insert into zaltyko.group_memberships values
      ('71000000-0000-4000-8000-000000000061', '${ID.org}', '${ID.madridGroup}', '${ID.athlete}', 'active', '2025-01-01', null),
      ('71000000-0000-4000-8000-000000000062', '${ID.org}', '${ID.pacificGroup}', '${ID.athlete}', 'active', '2025-01-01', null),
      ('71000000-0000-4000-8000-000000000063', '${ID.org}', '${ID.madridGroup}', '${ID.inactiveAthlete}', 'active', '2025-01-01', null),
      ('72000000-0000-4000-8000-000000000061', '${ID.rivalOrg}', '${ID.rivalGroup}', '${ID.rivalAthlete}', 'active', '2025-01-01', null);
  `);

  const sessions: Array<{
    id: string;
    organizationId: string;
    locationId: string;
    startsAt: string;
  }> = [];
  const attendanceRows: Array<{
    id: string;
    organizationId: string;
    locationId: string;
    sessionId: string;
  }> = [];
  const addSession = (
    organizationId: string,
    locationId: string,
    startsAt: string,
    id: string
  ) => {
    sessions.push({ id, organizationId, locationId, startsAt });
    const attendanceIndex = attendanceRows.length + 1;
    attendanceRows.push({
      id: `81000000-0000-4000-8000-${String(attendanceIndex).padStart(12, "0")}`,
      organizationId,
      locationId,
      sessionId: id,
    });
  };
  let sessionIndex = 0;
  for (const [locationId, starts] of [
    [
      ID.madrid,
      [
        "2026-03-28T22:59:59Z",
        "2026-03-28T23:00:00Z",
        "2026-03-29T21:59:59Z",
        "2026-03-29T22:00:00Z",
      ],
    ],
    [
      ID.pacific,
      [
        "2026-03-29T06:59:59Z",
        "2026-03-29T07:00:00Z",
        "2026-03-30T06:59:59Z",
        "2026-03-30T07:00:00Z",
      ],
    ],
  ] as const) {
    for (const startsAt of starts) {
      sessionIndex += 1;
      addSession(
        ID.org,
        locationId,
        startsAt,
        `71000000-0000-4000-8000-${String(sessionIndex).padStart(12, "0")}`
      );
    }
  }
  addSession(
    ID.rivalOrg,
    ID.rivalLocation,
    "2026-03-29T12:00:00Z",
    "72000000-0000-4000-8000-000000000101"
  );
  for (const row of sessions) {
    await pool.query(`insert into zaltyko.sessions values ($1, $2, $3, $4)`, [
      row.id,
      row.organizationId,
      row.locationId,
      row.startsAt,
    ]);
  }
  for (const row of attendanceRows) {
    await pool.query(
      `insert into zaltyko.attendance_records values ($1, $2, $3, $4)`,
      [row.id, row.organizationId, row.locationId, row.sessionId]
    );
  }

  await pool.query(
    `insert into zaltyko.payments values
      ('71000000-0000-4000-8000-000000000201', $1, $2, 'succeeded', 1000, 'EUR', '2026-03-28T23:00:00Z'),
      ('71000000-0000-4000-8000-000000000202', $1, $2, 'partially_refunded', 2000, 'EUR', '2026-03-29T21:59:59Z'),
      ('71000000-0000-4000-8000-000000000203', $1, $2, 'refunded', 3000, 'EUR', '2026-03-29T12:00:00Z'),
      ('71000000-0000-4000-8000-000000000204', $1, $2, 'pending', 5000, 'EUR', '2026-03-29T12:00:00Z'),
      ('71000000-0000-4000-8000-000000000205', $1, $2, 'failed', 7000, 'EUR', '2026-03-29T12:00:00Z'),
      ('71000000-0000-4000-8000-000000000206', $1, $2, 'succeeded', 8000, 'EUR', '2026-03-29T22:00:00Z'),
      ('71000000-0000-4000-8000-000000000207', $1, $2, 'succeeded', 9000, 'EUR', '2026-03-28T22:59:59Z'),
      ('71000000-0000-4000-8000-000000000208', $1, $3, 'succeeded', 700, 'USD', '2026-03-29T07:00:00Z'),
      ('71000000-0000-4000-8000-000000000209', $1, $3, 'succeeded', 800, 'USD', '2026-03-30T06:59:59Z'),
      ('71000000-0000-4000-8000-000000000210', $1, $3, 'succeeded', 900, 'USD', '2026-03-30T07:00:00Z'),
      ('72000000-0000-4000-8000-000000000201', $4, $5, 'succeeded', 99999, 'EUR', '2026-03-29T12:00:00Z')`,
    [ID.org, ID.madrid, ID.pacific, ID.rivalOrg, ID.rivalLocation]
  );

  await pool.query(`
    grant usage on schema zaltyko to operational_summary_owner, operational_summary_manager;
    grant select on zaltyko.organizations, zaltyko.organization_members,
      zaltyko.locations, zaltyko.member_location_scopes, zaltyko.groups,
      zaltyko.athletes, zaltyko.group_memberships, zaltyko.sessions,
      zaltyko.attendance_records
      to operational_summary_owner, operational_summary_manager;
    grant select on zaltyko.payments to operational_summary_owner;
  `);
}

async function runServiceAs(
  role: "owner" | "manager"
): Promise<Record<string, unknown>> {
  const { getOwnerOperationalSummary } =
    await import("@/modules/owner-dashboard/application/operational-summary");
  const userId = role === "owner" ? ID.ownerUser : ID.managerUser;
  const result = await getOwnerOperationalSummary({
    userId,
    organizationId: ID.org,
    from: "2026-03-29",
    to: "2026-03-29",
  });
  console.log(JSON.stringify(result));
  return result as unknown as Record<string, unknown>;
}

async function runChild(role: "owner" | "manager"): Promise<void> {
  try {
    assert.equal(
      process.env[LOCAL_ONLY],
      "1",
      "El modo child solo se ejecuta en el harness local"
    );
    const result = await runServiceAs(role);
    assert.equal(
      result.scope && (result.scope as { kind: string }).kind,
      role === "owner" ? "organization" : "location"
    );
    const metrics = result.metrics as Record<string, unknown>;
    assert.equal(
      metrics.activeAthletes,
      1,
      "Deduplicar atleta con memberships en dos grupos/sedes"
    );
    assert.equal(metrics.activeGroups, role === "owner" ? 2 : 1);
    assert.equal(
      metrics.attendanceRecords,
      role === "owner" ? 4 : 2,
      "Fechas locales inclusivas en el cambio DST"
    );
    if (role === "owner") {
      assert.deepEqual(metrics.paymentsReceived, {
        state: "available",
        count: 5,
        grossByCurrency: [
          { currency: "EUR", amountCents: 6000 },
          { currency: "USD", amountCents: 1500 },
        ],
        label: "Bruto recibido sin netear devoluciones",
      });
    } else {
      assert.deepEqual(metrics.paymentsReceived, {
        state: "unavailable",
        reason: "financial_access_required",
      });
    }
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  for (const executable of ["initdb", "pg_ctl"]) {
    run(executable, ["--version"]);
  }
  const root = mkdtempSync(join(tmpdir(), "oos-pg."));
  const dataDir = join(root, "data");
  const logFile = join(root, "postgres.log");
  const port = await availablePort();
  let started = false;
  const setupPool = new Pool({
    host: "127.0.0.1",
    port,
    database: "postgres",
    user: "postgres",
    max: 2,
  });
  try {
    run("initdb", [
      "-D",
      dataDir,
      "-U",
      "postgres",
      "-A",
      "trust",
      "--no-locale",
      "-E",
      "UTF8",
    ]);
    run("pg_ctl", [
      "-D",
      dataDir,
      "-o",
      `-F -h 127.0.0.1 -p ${port} -c log_statement=all`,
      "-l",
      logFile,
      "start",
      "-w",
    ]);
    started = true;
    await setupPool.query(`
      create role operational_summary_owner login;
      create role operational_summary_manager login;
    `);
    await createFixture(setupPool);

    for (const role of ["owner", "manager"] as const) {
      const user =
        role === "owner"
          ? "operational_summary_owner"
          : "operational_summary_manager";
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: localPgUrl(user, port),
        NODE_ENV: "test",
        [LOCAL_ONLY]: "1",
      };
      delete env.DATABASE_URL_POOL;
      delete env.DATABASE_URL_DIRECT;
      const child = spawnSync(
        "pnpm",
        [
          "exec",
          "tsx",
          "scripts/verify-owner-operational-summary-local.ts",
          "--child",
          role,
        ],
        { cwd: ROOT, env, encoding: "utf8", stdio: "pipe" }
      );
      if (child.error) throw child.error;
      if (child.status !== 0) {
        throw new Error(
          `Verificación PostgreSQL para ${role} falló (${child.status}): ${child.stderr || child.stdout}`
        );
      }
      console.log(child.stdout.trim().split("\n").at(-1));
    }

    const managerRoleCanReadPayments = await setupPool.query<{
      allowed: boolean;
    }>(`
      select has_table_privilege(
        'operational_summary_manager', 'zaltyko.payments', 'select'
      ) as allowed
    `);
    assert.equal(managerRoleCanReadPayments.rows[0]?.allowed, false);
    console.log(
      JSON.stringify({
        status: "PASS",
        database: "PostgreSQL local aislado con pg14",
        attendance:
          "límites locales inclusivos/exclusivos verificados en Europe/Madrid DST y America/Los_Angeles",
        athletes: "membership M:N deduplicada; tenant ajeno excluido",
        payments:
          "succeeded/partially_refunded/refunded brutos; pending/failed fuera; totales separados por moneda",
        manager:
          "consulta real sin permiso SELECT sobre payments y sin consultar la tabla financiera",
      })
    );
  } finally {
    await setupPool.end();
    if (started) {
      run("pg_ctl", ["-D", dataDir, "-m", "fast", "stop", "-w"]);
    }
    rmSync(root, { recursive: true, force: true });
  }
}

const childMode = process.argv[2] === "--child" ? process.argv[3] : undefined;
async function entry(): Promise<void> {
  if (childMode === "owner" || childMode === "manager") {
    await runChild(childMode);
  } else if (childMode) {
    throw new Error(`Modo child no reconocido: ${childMode}`);
  } else {
    await main();
  }
}

entry().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
