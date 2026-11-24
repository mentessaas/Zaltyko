import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@/db";
import {
  createOrganizationLogoUrlForOrganization,
  getOrganizationLogoState,
  setOrganizationLogoPath,
} from "@/modules/organizations/infrastructure/organization-logo-storage";

const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";
const describeDisposablePg = describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1");
const ORGANIZATION_ID = randomUUID();
const LOGO_PATH = `${ORGANIZATION_ID}/logo.png`;
let candidateApplied = false;

type PgFailure = { code?: string; cause?: PgFailure } | null;

async function failureOf(statement: Promise<unknown>): Promise<PgFailure> {
  const failure = (await statement.then(
    () => null,
    (error) => error
  )) as PgFailure;
  return failure?.cause ?? failure;
}

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

async function runOnOwnConnection(statement: string) {
  const client = new Client({ connectionString: process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

const candidate = () =>
  readFileSync(
    resolve(process.cwd(), "docs/deployment/candidates/20261124120000_organization_logos_candidate.sql"),
    "utf8"
  );

describeDisposablePg("organization logo candidate on disposable PostgreSQL", () => {
  beforeAll(async () => {
    assertDisposableTarget();
    const result = await db.execute(sql`
      select
        exists (select 1 from information_schema.columns where table_schema = 'zaltyko' and table_name = 'organizations' and column_name = 'logo_path') as has_column,
        exists (select 1 from storage.buckets where id = 'organization-logos') as has_bucket,
        exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'organization_logos_server_only') as has_policy
    `);
    expect(result.rows[0]).toEqual({ has_column: false, has_bucket: false, has_policy: false });
    await db.execute(sql`
      insert into zaltyko.organizations (id, name)
      values (${ORGANIZATION_ID}::uuid, 'CI logo candidate')
    `);
  });

  it("reads no logo without the candidate and reads/writes it after applying the candidate SQL", async () => {
    expect(await getOrganizationLogoState(ORGANIZATION_ID)).toEqual({ available: false, logoPath: null });
    expect(await setOrganizationLogoPath(ORGANIZATION_ID, LOGO_PATH, null)).toBe(false);
    expect(await createOrganizationLogoUrlForOrganization(ORGANIZATION_ID)).toBeNull();

    await runOnOwnConnection(candidate());
    candidateApplied = true;

    expect(await getOrganizationLogoState(ORGANIZATION_ID)).toEqual({ available: true, logoPath: null });
    expect(await setOrganizationLogoPath(ORGANIZATION_ID, LOGO_PATH, null)).toBe(true);
    expect(await getOrganizationLogoState(ORGANIZATION_ID)).toEqual({ available: true, logoPath: LOGO_PATH });

    const invalidPath = await failureOf(db.execute(sql`
      update zaltyko.organizations
      set logo_path = ${`${randomUUID()}/logo.png`}
      where id = ${ORGANIZATION_ID}::uuid
    `));
    expect(invalidPath?.code).toBe("23514");
  }, 60_000);

  afterAll(async () => {
    if (!disposablePgEnabled) return;
    await db.execute(sql`delete from zaltyko.organizations where id = ${ORGANIZATION_ID}::uuid`);
    if (!candidateApplied) return;
    await runOnOwnConnection(`
      delete from storage.objects where bucket_id = 'organization-logos';
      drop policy if exists organization_logos_server_only on storage.objects;
      delete from storage.buckets where id = 'organization-logos';
      alter table zaltyko.organizations drop constraint if exists organizations_logo_path_scope;
      alter table zaltyko.organizations drop column if exists logo_path;
    `);
  });
});
