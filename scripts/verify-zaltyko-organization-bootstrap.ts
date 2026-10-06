import assert from "node:assert/strict";

import { Pool } from "pg";
import type { User } from "@supabase/supabase-js";

import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";
import { bootstrapOrganization } from "@/modules/organizations/application/bootstrap-organization";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
const pool = new Pool({ connectionString: databaseUrl });
const ownerUser = "30000000-0000-0000-0000-000000000101";
const outsiderUser = "30000000-0000-0000-0000-000000000102";

function authUser(id: string, email: string): User {
  return {
    id,
    email,
    aud: "authenticated",
    created_at: "2026-10-06T00:00:00.000Z",
    app_metadata: {},
    user_metadata: { initial_role: "owner" },
  };
}

async function scalar(query: string, values: unknown[] = []): Promise<number> {
  const result = await pool.query(query, values);
  return Number(result.rows[0].value);
}

async function main() {
  const command = {
    userId: ownerUser,
    organizationName: "Academia Sintética Norte",
    countryCode: "ES",
    timezone: "Europe/Madrid",
    locationName: "Sede Principal",
    locationCode: "principal",
    idempotencyKey: "bootstrap-synthetic-001",
  };
  const results = await Promise.all([
    bootstrapOrganization(command),
    bootstrapOrganization(command),
    bootstrapOrganization(command),
  ]);
  assert.equal(new Set(results.map((item) => item.organizationId)).size, 1);
  assert.equal(
    await scalar("select count(*)::int value from zaltyko.organizations"),
    1
  );
  assert.equal(
    await scalar("select count(*)::int value from zaltyko.locations"),
    1
  );
  assert.equal(
    await scalar(
      "select count(*)::int value from zaltyko.organization_members"
    ),
    1
  );
  assert.equal(
    await scalar(
      "select count(*)::int value from zaltyko.organization_bootstrap_commands"
    ),
    1
  );
  assert.equal(
    await scalar(
      "select count(*)::int value from zaltyko.outbox_events where event_name='organization.bootstrapped'"
    ),
    1
  );
  assert.equal(
    await scalar(
      "select count(*)::int value from zaltyko.audit_log where action='organization.bootstrapped'"
    ),
    1
  );

  await assert.rejects(
    bootstrapOrganization({ ...command, organizationName: "Otro nombre" }),
    (error: unknown) => {
      assert(error instanceof OperationalError);
      assert.equal(error.code, "IDEMPOTENCY_CONFLICT");
      return true;
    }
  );
  await assert.rejects(
    bootstrapOrganization({
      ...command,
      idempotencyKey: "bootstrap-synthetic-002",
    }),
    (error: unknown) => {
      assert(error instanceof OperationalError);
      assert.equal(error.code, "INVALID_STATE_TRANSITION");
      return true;
    }
  );

  const scope = await resolveOwnerScope({ userId: ownerUser });
  assert.equal(scope.organization.id, results[0].organizationId);
  assert.equal(scope.selectedLocationId, null);
  assert.equal(scope.canViewOrganizationAggregate, true);
  const ownerHome = await resolveUserEntry(
    authUser(ownerUser, "owner.synthetic@example.test")
  );
  assert.equal(
    ownerHome.redirectUrl,
    `/owner?organizationId=${results[0].organizationId}`
  );
  const newOwnerHome = await resolveUserEntry(
    authUser(outsiderUser, "new-owner.synthetic@example.test")
  );
  assert.equal(newOwnerHome.redirectUrl, "/owner/setup");
  await assert.rejects(
    resolveOwnerScope({
      userId: outsiderUser,
      organizationId: results[0].organizationId,
    }),
    (error: unknown) => {
      assert(error instanceof OperationalError);
      assert.equal(error.code, "FORBIDDEN");
      return true;
    }
  );

  assert.equal(
    await scalar(
      `select count(*)::int value
       from information_schema.role_table_grants
       where table_schema='zaltyko'
         and table_name='organization_bootstrap_commands'
         and grantee='authenticated'`
    ),
    0
  );
  const rls = await pool.query(
    `select relrowsecurity, relforcerowsecurity
     from pg_class join pg_namespace on pg_namespace.oid=pg_class.relnamespace
     where nspname='zaltyko' and relname='organization_bootstrap_commands'`
  );
  assert.equal(rls.rows[0].relrowsecurity, true);
  assert.equal(rls.rows[0].relforcerowsecurity, true);

  console.log(
    JSON.stringify({
      status: "PASS",
      tripleSubmitOneOrganization: results[0].organizationId,
      ownerScope: scope.organization.id,
      ownerAuthEntry: ownerHome.redirectUrl,
      newOwnerAuthEntry: newOwnerHome.redirectUrl,
      locationScopeMode: "all",
      crossTenantDenied: true,
      dataApiGrants: 0,
      rlsForced: true,
    })
  );
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
