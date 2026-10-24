import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_LOCAL_SUPABASE_IMAGES,
  EXCLUDED_LOCAL_SUPABASE_IMAGES,
  REQUIRED_LOCAL_SUPABASE_IMAGES,
} from "../scripts/lib/local-e2e-preflight";

const workflowPath = resolve(process.cwd(), ".github/workflows/ci-isolated.yml");
const mainCiWorkflowPath = resolve(process.cwd(), ".github/workflows/ci.yml");
const directoryWorkflowPath = resolve(process.cwd(), ".github/workflows/directory-integrity.yml");
const vitestConfigPath = resolve(process.cwd(), "vitest.config.ts");
const sharedSetupPath = resolve(process.cwd(), "tests/setup.ts");
const lockfileGuardPath = resolve(process.cwd(), "scripts/ci/validate-lockfile-refresh.cjs");
const imagePreloaderPath = resolve(
  process.cwd(),
  "scripts/ci/preload-local-e2e-images.ts"
);
const schemaBaselinePath = resolve(
  process.cwd(),
  "supabase/migrations/20261024172153_sandbox_schema_snapshot_baseline.sql"
);
const schemaSnapshotManifestPath = resolve(process.cwd(), "supabase/schema-snapshot-manifest.json");
const schemaRlsHardeningMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20261024193934_rls_guard_missing_public_tables.sql"
);
const capacityIntegrationTestPath = resolve(
  process.cwd(),
  "tests/saas-capacity-postgres.integration.test.ts"
);
const billingIntegrationTestPath = resolve(
  process.cwd(),
  "tests/billing-ledger-postgres.integration.test.ts"
);

const lockfileGuard = require(lockfileGuardPath) as {
  MAX_GIT_OUTPUT_BYTES: number;
  TARGET_VERSIONS: Array<{ name: string; from: string; to: string; integrity: string }>;
  assertGitOutputWithinLimit: (output: string | Buffer) => string | Buffer;
  assertExpectedGitStatus: (status: string) => void;
  execGit: (args: string[], run?: (...args: unknown[]) => string) => string;
  validateLockfileRefresh: (input: {
    beforeText: string;
    afterText: string;
    changedFiles: string[];
  }) => void;
};

describe("isolated CI workflow contract", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const mainCiWorkflow = readFileSync(mainCiWorkflowPath, "utf8");
  const directoryWorkflow = readFileSync(directoryWorkflowPath, "utf8");
  const vitestConfig = readFileSync(vitestConfigPath, "utf8");
  const sharedSetup = readFileSync(sharedSetupPath, "utf8");

  it("uses existing fail-closed SQL source validators for directory changes", () => {
    expect(directoryWorkflow).toMatch(/on:\s*[\s\S]*?pull_request:/);
    expect(directoryWorkflow).toContain("workflow_dispatch:");
    expect(directoryWorkflow).toContain("persist-credentials: false");
    expect(directoryWorkflow).toContain("pnpm validate:rls");
    expect(directoryWorkflow).toContain("pnpm check:migrations");
    expect(directoryWorkflow).toContain("no database replay");
    expect(directoryWorkflow).not.toContain("scripts/directory/test-local.sh");
    expect(directoryWorkflow).not.toMatch(/\bsecrets\.|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|DATABASE_URL/);
  });

  it("runs only on manual dispatch with read-only repository permissions", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/);
    expect(workflow).toContain("resolution_mode:");
    expect(workflow).toContain("default: checks");
    expect(workflow).toContain("- schema-replay");
    expect(workflow).toContain("- remote-build");
    expect(workflow).toContain("- checks-and-build");
    expect(workflow).toContain("- lockfile-refresh");
    expect(workflow).toContain("- vite-refresh");
    expect(workflow).toContain("expected_sha:");
    expect(workflow).toContain("SHA completo del HEAD seleccionado para replay, build o resolución de lockfile");
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(workflow).toMatch(/persist-credentials:\s*false/);
    expect(workflow).not.toMatch(/^\s*(push|pull_request|schedule):/m);
  });

  it("keeps the local-E2E Supabase CLI download on its separately pinned release", () => {
    expect(mainCiWorkflow).toContain(
      "https://github.com/supabase/cli/releases/download/v2.84.2/supabase_2.84.2_linux_amd64.tar.gz"
    );
    expect(mainCiWorkflow).toContain("python3 scripts/ci/install_pinned_supabase_cli.py \"$archive\"");
    expect(mainCiWorkflow).toContain("scripts/ci/preload-local-e2e-images.ts");
    expect(mainCiWorkflow).toContain("pnpm test:e2e:local");
  });

  it("preloads only the active pinned Supabase images on disposable GitHub Linux runners", () => {
    const imagePreloader = readFileSync(imagePreloaderPath, "utf8");
    expect(REQUIRED_LOCAL_SUPABASE_IMAGES).toHaveLength(13);
    expect(EXCLUDED_LOCAL_SUPABASE_IMAGES).toHaveLength(2);
    expect(ACTIVE_LOCAL_SUPABASE_IMAGES).toHaveLength(11);
    expect(ACTIVE_LOCAL_SUPABASE_IMAGES).toEqual(
      REQUIRED_LOCAL_SUPABASE_IMAGES.filter((image) =>
        EXCLUDED_LOCAL_SUPABASE_IMAGES.every((excluded) => excluded !== image)
      )
    );
    expect(imagePreloader).toContain('process.env.GITHUB_ACTIONS !== "true"');
    expect(imagePreloader).toContain('process.platform !== "linux"');
    expect(imagePreloader).toContain("ACTIVE_LOCAL_SUPABASE_IMAGES");
    expect(imagePreloader).toContain('docker(["pull", image], false)');
  });

  it("builds only an exact candidate SHA on a remote runner with placeholders and no provider access", () => {
    const buildJob = workflow.match(/  candidate-build:([\s\S]*?)(?=\n  lockfile-refresh:|$)/)?.[1] ?? "";
    expect(buildJob).toContain("inputs.resolution_mode == 'remote-build'");
    expect(buildJob).toContain("inputs.resolution_mode == 'checks-and-build'");
    expect(buildJob).toContain("needs.schema-replay.result == 'success'");
    expect(buildJob).toContain("needs.static-and-unit.result == 'success'");
    expect(buildJob).toContain("runs-on: ubuntu-latest");
    expect(buildJob).toContain("contents: read");
    expect(buildJob).toContain("persist-credentials: false");
    expect(buildJob).toContain("branch='codex/owner-isolated-validation-20261023'");
    expect(buildJob).toContain('[[ "$EXPECTED_SHA" == "$head_sha" ]]');
    expect(buildJob).toContain("VERCEL_ENV: preview");
    expect(buildJob).toContain("pnpm install --frozen-lockfile --prod=false");
    expect(buildJob).toContain("pnpm build");
    expect(buildJob).toContain("placeholder.supabase.co");
    expect(buildJob).toContain("placeholder:placeholder@placeholder:5432/placeholder");
    expect(buildJob).not.toMatch(/\bsecrets\.|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|VERCEL_TOKEN|upload-artifact|uses:\s*vercel\/|actions\/deploy/i);
    expect(buildJob).not.toMatch(/^\s*cache:/m);
  });

  it("keeps checks on normal dispatches, isolates replay-only mode, and scopes lockfile refresh", () => {
    const checksJob = workflow.match(/  static-and-unit:([\s\S]*?)(?=\n  schema-replay:|$)/)?.[1] ?? "";
    const refreshJob = workflow.match(/  lockfile-refresh:([\s\S]*?)(?=\n  vite-refresh:|$)/)?.[1] ?? "";
    const checksJobHeader = checksJob.split("\n    steps:")[0] ?? "";
    expect(checksJobHeader).toContain("if: ${{ inputs.resolution_mode != 'schema-replay' }}");
    expect(refreshJob).toContain("if: ${{ inputs.resolution_mode == 'lockfile-refresh' }}");
    const refreshActions = [...refreshJob.matchAll(/^\s+uses:\s*(\S+)/gm)].map((match) => match[1]);
    expect(refreshActions).toEqual([
      "actions/checkout@v7",
      "pnpm/action-setup@v6",
      "actions/setup-node@v7",
    ]);
    expect(refreshJob).toContain("contents: read");
    expect(refreshJob).toContain("persist-credentials: false");
    expect(refreshJob).toContain("EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(refreshJob).toContain("DISPATCH_SHA: ${{ github.sha }}");
    expect(refreshJob).toContain("DISPATCH_REF: ${{ github.ref }}");
    expect(refreshJob).toContain("[[ \"$EXPECTED_SHA\" =~ ^[0-9a-f]{40}$ ]]");
    expect(refreshJob).toContain("[[ \"$DISPATCH_SHA\" == \"$head_sha\" ]]");
    expect(refreshJob).toContain("[[ \"$EXPECTED_SHA\" == \"$head_sha\" ]]");
    expect(refreshJob).toContain("version: 9.15.9");
    expect(refreshJob).toContain('node-version: "22"');
    expect(refreshJob).toContain(
      "pnpm update --depth 99 --lockfile-only --no-save --ignore-scripts follow-redirects hono"
    );
    expect(refreshJob).not.toMatch(/follow-redirects@|hono@/);
    expect(lockfileGuard.TARGET_VERSIONS).toEqual([
      {
        name: "follow-redirects",
        from: "1.16.0",
        to: "1.16.1",
        integrity: "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==",
      },
      {
        name: "hono",
        from: "4.13.7",
        to: "4.13.13",
        integrity: "sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==",
      },
    ]);
    expect(refreshJob).toContain("node scripts/ci/project-targeted-lockfile-refresh.cjs");
    expect(refreshJob).toContain("pnpm install --frozen-lockfile --ignore-scripts --no-optional");
    expect(refreshJob).toContain(
      "EXPECTED_PROJECTED_LOCK_SHA256: ${{ steps.targeted-lockfile-projection.outputs.projected_lock_sha256 }}"
    );
    expect(refreshJob).toContain('node scripts/ci/project-targeted-lockfile-refresh.cjs --verify "$EXPECTED_PROJECTED_LOCK_SHA256"');
    const projectionIndex = refreshJob.indexOf("node scripts/ci/project-targeted-lockfile-refresh.cjs\n");
    const frozenInstallIndex = refreshJob.indexOf("pnpm install --frozen-lockfile --ignore-scripts --no-optional", projectionIndex);
    const finalGuardIndex = refreshJob.indexOf("node scripts/ci/validate-lockfile-refresh.cjs");
    expect(projectionIndex).toBeGreaterThanOrEqual(0);
    expect(frozenInstallIndex).toBeGreaterThan(projectionIndex);
    expect(finalGuardIndex).toBeGreaterThan(frozenInstallIndex);
    expect(refreshJob).not.toMatch(/\bsecrets\.|cache:|upload-artifact|git push|git commit|pnpm (?:build|typecheck|test)\b/i);
  });

  it("keeps the schema baseline byte-exact and authorizes one ordered RLS hardening migration", () => {
    const baseline = readFileSync(schemaBaselinePath);
    const manifest = JSON.parse(readFileSync(schemaSnapshotManifestPath, "utf8")) as {
      baseline: { sha256: string };
    };
    const hardeningMigration = readFileSync(schemaRlsHardeningMigrationPath, "utf8");
    const baselineSha256 = createHash("sha256").update(baseline).digest("hex");
    const hardeningSha256 = createHash("sha256").update(hardeningMigration).digest("hex");
    const createdRelations = [...hardeningMigration.matchAll(/CREATE TABLE public\.([a-z_]+)/g)].map(
      (match) => `public.${match[1]}`
    );
    const denyPolicyRelations = [
      ...hardeningMigration.matchAll(
        /CREATE POLICY deny_all_non_bypass_access ON ((?:public|zaltyko)\.[a-z_]+)/g
      ),
    ].map((match) => match[1]);
    const expectedDenyPolicyRelations = [
      "public.actor_pages",
      "public.actor_consents",
      "public.athlete_skills",
      "public.products",
      "public.sales",
      "zaltyko.audit_log",
      "zaltyko.family_collection_preferences",
      "zaltyko.family_payment_authorizations",
      "zaltyko.health_score_metric_contributions",
      "zaltyko.insight_notifications",
      "zaltyko.insight_run_observations",
      "zaltyko.insight_status_history",
      "zaltyko.metric_event_consumptions",
      "zaltyko.metric_invalidations",
      "zaltyko.organization_bootstrap_commands",
      "zaltyko.organization_entitlement_changes",
      "zaltyko.organization_entitlements",
      "zaltyko.organization_payment_provider_accounts",
      "zaltyko.organization_saas_checkout_operations",
      "zaltyko.organization_saas_customers",
      "zaltyko.organization_saas_subscriptions",
      "zaltyko.organization_saas_trials",
      "zaltyko.organization_saas_webhook_events",
      "zaltyko.organization_saas_webhook_payload_conflicts",
      "zaltyko.organization_saas_webhook_reconciliation_decisions",
      "zaltyko.organization_saas_webhook_reconciliation_results",
      "zaltyko.outbox_events",
      "zaltyko.payment_provider_events",
    ];
    const replayScript = readFileSync(
      resolve(process.cwd(), "scripts/ci/verify-sandbox-schema-replay.sh"),
      "utf8"
    );
    const tenantFixture = readFileSync(
      resolve(process.cwd(), "scripts/ci/sandbox-tenant-isolation.sql"),
      "utf8"
    );
    const fixtureTenantRelations = [
      ...tenantFixture.matchAll(/^\s+'((?:public|zaltyko)\.[a-z_]+)',?$/gm),
    ].map((match) => match[1]);

    expect(baselineSha256).toBe("fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36");
    expect(manifest.baseline.sha256).toBe(baselineSha256);
    expect(hardeningSha256).toBe("005d16a4b2f87727c2c47b3affe5ccd5433323fdcf02404135cbf5d11be07959");
    expect(createdRelations).toEqual([
      "public.actor_pages",
      "public.actor_consents",
      "public.athlete_skills",
      "public.products",
      "public.sales",
    ]);
    expect(denyPolicyRelations).toEqual(expectedDenyPolicyRelations);
    expect(fixtureTenantRelations).toEqual(expectedDenyPolicyRelations);
    expect(hardeningMigration.match(/REVOKE ALL PRIVILEGES ON TABLE public\./g)).toHaveLength(5);
    expect(hardeningMigration.match(/TO service_role;/g)).toHaveLength(5);
    expect(hardeningMigration).toContain("AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)");

    expect(replayScript).toContain(
      'readonly MIGRATION_NAME="20261024172153_sandbox_schema_snapshot_baseline.sql"'
    );
    expect(replayScript).toContain(
      'readonly RLS_HARDENING_MIGRATION_NAME="20261024193934_rls_guard_missing_public_tables.sql"'
    );
    expect(replayScript).toContain(`readonly BASELINE_SHA256="${baselineSha256}"`);
    expect(replayScript).toContain(`readonly RLS_HARDENING_MIGRATION_SHA256="${hardeningSha256}"`);
    expect(replayScript).toContain(
      '[[ "${#migrations[@]}" -eq 2 && "${migrations[0]}" == "$MIGRATION_NAME" && "${migrations[1]}" == "$RLS_HARDENING_MIGRATION_NAME" ]]'
    );
    expect(replayScript).toContain("The current-state baseline bytes differ from the reviewed snapshot.");
    expect(replayScript).toContain("The RLS hardening migration differs from the reviewed candidate.");
    expect(replayScript).toContain(
      'readonly RLS_HARDENING_MIGRATION_FILE="$RUNNER_TEMP/$PROJECT_ID-rls-hardening-migration.sql"'
    );
    expect(replayScript).toContain(
      'cat -- "$ROLE_GUARD_FILE" "$ROOT/supabase/migrations/$RLS_HARDENING_MIGRATION_NAME" \\\n  >"$RLS_HARDENING_MIGRATION_FILE"'
    );
    expect(replayScript).toContain('chmod 600 "$RLS_HARDENING_MIGRATION_FILE"');
    expect(replayScript).toContain('cp -- "$RLS_HARDENING_MIGRATION_FILE"');
    const baselineCopyIndex = replayScript.indexOf(
      'cp -- "$MARKED_BASELINE_FILE" "$CI_WORKDIR/supabase/migrations/$MIGRATION_NAME"'
    );
    const baselineReplayIndex = replayScript.indexOf(
      'migration up --db-url "$LOCAL_DB_URL"',
      baselineCopyIndex
    );
    const hardeningConcatIndex = replayScript.indexOf(
      'cat -- "$ROLE_GUARD_FILE" "$ROOT/supabase/migrations/$RLS_HARDENING_MIGRATION_NAME"'
    );
    const hardeningCopyIndex = replayScript.indexOf('cp -- "$RLS_HARDENING_MIGRATION_FILE"');
    const hardeningReplayIndex = replayScript.indexOf(
      'migration up --db-url "$LOCAL_DB_URL"',
      hardeningCopyIndex
    );
    expect(baselineCopyIndex).toBeGreaterThanOrEqual(0);
    expect(baselineReplayIndex).toBeGreaterThan(baselineCopyIndex);
    expect(hardeningConcatIndex).toBeGreaterThan(baselineReplayIndex);
    expect(hardeningCopyIndex).toBeGreaterThan(hardeningConcatIndex);
    expect(hardeningReplayIndex).toBeGreaterThan(hardeningCopyIndex);
    expect(hardeningReplayIndex).toBeLessThan(
      replayScript.indexOf('cat -- "$ROLE_GUARD_FILE" "$ROOT/scripts/ci/sandbox-tenant-isolation.sql"')
    );
    expect(tenantFixture).toContain("required protected relation % is missing");
    expect(tenantFixture).toContain("relrowsecurity");
    expect(tenantFixture).toContain("relforcerowsecurity");
    expect(tenantFixture).toContain("p.polroles = ARRAY[0::oid]");
    expect(tenantFixture).toContain("has_table_privilege(v_role, v_relation_oid, v_privilege)");
    expect(tenantFixture).toContain("has_column_privilege(v_role, v_relation_oid, v_column_number, v_privilege)");
    expect(tenantFixture).toContain("'MAINTAIN'");
  });

  it("replays the baseline and reviewed hardening migration only on an exact-SHA disposable local Supabase stack", () => {
    const replayJob = workflow.match(/  schema-replay:([\s\S]*?)(?=\n  candidate-build:|$)/)?.[1] ?? "";
    const replayScript = readFileSync(resolve(process.cwd(), "scripts/ci/verify-sandbox-schema-replay.sh"), "utf8");
    const capacityIntegrationTest = readFileSync(capacityIntegrationTestPath, "utf8");
    const billingIntegrationTest = readFileSync(billingIntegrationTestPath, "utf8");
    const replayHeader = replayJob.split("\n    steps:")[0] ?? "";
    expect(replayHeader).not.toMatch(/^\s+needs:/m);
    expect(replayJob).toContain("inputs.resolution_mode == 'schema-replay'");
    expect(replayJob).toContain("inputs.resolution_mode == 'checks-and-build'");
    expect(replayJob).toContain("runs-on: ubuntu-latest");
    expect(replayJob).toContain("contents: read");
    expect(replayJob).toContain("persist-credentials: false");
    expect(replayJob).toContain("supabase_2.119.0_linux_amd64.tar.gz");
    expect(replayJob).toContain("python3 scripts/ci/test_install_schema_replay_supabase_cli.py");
    expect(replayJob).toContain("python3 scripts/ci/install_schema_replay_supabase_cli.py");
    expect(replayJob).toContain("pnpm install --frozen-lockfile --prod=false");
    expect(replayJob).toContain("bash scripts/ci/verify-sandbox-schema-replay.sh");
    expect(replayJob).not.toMatch(/\bsecrets\.|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN|STRIPE_SECRET_KEY|supabase link|--linked|actions\/deploy/i);
    expect(replayScript).toContain('"${GITHUB_ACTIONS:-}" == "true"');
    expect(replayScript).toContain('"${RUNNER_OS:-}" == "Linux"');
    expect(replayScript).toContain("EXPECTED_SHA");
    expect(replayScript).toContain("diagnose_start_failure");
    expect(replayScript).toContain("diagnose_marker_failure");
    expect(replayScript).toContain("diagnose_tenant_failure");
    expect(replayScript).toContain("Sanitized tenant-isolation error excerpt");
    expect(replayScript).toContain("credential-bearing output remains withheld");
    expect(replayScript).toContain("Sanitized CLI startup error excerpt");
    expect(replayScript).toContain("ZALTYKO_PG_INTEGRATION=1");
    expect(replayScript).toContain('pnpm exec vitest run --project web tests/saas-capacity-postgres.integration.test.ts');
    expect(replayScript).toContain("tests/billing-ledger-postgres.integration.test.ts");
    expect(replayScript).toContain('>"$INTEGRATION_LOG" 2>&1');
    expect(replayScript).toContain("Free capacity, manual billing ledger concurrency");
    expect(replayScript).toContain("manual billing ledger concurrency");
    expect(capacityIntegrationTest).toContain('process.env.ZALTYKO_PG_INTEGRATION !== "1"');
    expect(capacityIntegrationTest).toContain('["127.0.0.1", "localhost", "::1"]');
    expect(capacityIntegrationTest).toContain("PLAN_OVER_CAPACITY");
    expect(capacityIntegrationTest).toContain("content_hash");
    expect(billingIntegrationTest).toContain('process.env.ZALTYKO_PG_INTEGRATION !== "1"');
    expect(billingIntegrationTest).toContain('"CHARGE_ALREADY_SETTLED"');
    expect(billingIntegrationTest).toContain('"payment_allocations"');
    expect(billingIntegrationTest).toContain('"outbox_events"');
    expect(vitestConfig).toContain("tests/saas-capacity-postgres.integration.test.ts");
    expect(vitestConfig).toContain("tests/billing-ledger-postgres.integration.test.ts");
    expect(sharedSetup).toContain("ZALTYKO_PG_INTEGRATION_DATABASE_URL");
    expect(replayScript).toContain("export SUPABASE_EXPERIMENTAL_STACK=1");
    expect(replayScript).toContain('"$CLI" --workdir "$CI_WORKDIR" stack start');
    expect(replayScript).toContain('"$CLI" --workdir "$CI_WORKDIR" stack status');
    expect(replayScript).toContain("Sanitized native stack status:");
    expect(replayScript).toContain('>"$STATUS_LOG" 2>"$STATUS_ERROR_LOG"');
    expect(replayScript).toContain('"$START_LOG" "$STATUS_LOG" "$STATUS_ERROR_LOG" "$LOCAL_DB_URL_FILE"');
    expect(replayScript).toContain('"$CLI" --workdir "$CI_WORKDIR" migration up --db-url "$LOCAL_DB_URL"');
    expect(replayScript).toContain('python3 - "$STATUS_LOG" "$PROJECT_ID" "$CI_WORKDIR" "$LOCAL_DB_URL_FILE"');
    expect(replayScript).toContain('parsed_url.hostname not in {"127.0.0.1", "localhost", "::1"}');
    expect(replayScript).toContain('db_url_path.chmod(0o600)');
    expect(replayScript).toContain('query = urlencode([("sslmode", "disable")])');
    expect(replayScript).toContain('admin_url.username != "supabase_admin"');
    expect(replayScript).toContain('readonly ROLE_PROBE_NAME="20261024172151_sandbox_replay_principal_probe.sql"');
    expect(replayScript).toContain('readonly AUTH_JWT_MIGRATION_NAME="20261024172152_supabase_auth_jwt_platform_prerequisite.sql"');
    expect(replayScript).toContain("pg_get_function_result(to_regprocedure('auth.jwt()')) = 'jsonb'");
    expect(replayScript).toContain("CREATE OR REPLACE FUNCTION auth.jwt()");
    expect(replayScript).toContain("Installed the upstream-compatible auth.jwt() helper only in disposable CI Postgres.");
    expect(replayScript).toContain("EXECUTE 'SET ROLE NONE';");
    expect(replayScript).toContain('role_guard = b"""DO $ci_supabase_admin_role_guard$');
    expect(replayScript).not.toContain('role_guard = b"""SET ROLE NONE;');
    expect(replayScript).toContain("session_user <> 'supabase_admin' OR current_user <> 'supabase_admin'");
    expect(replayScript).toContain("target.write(b\"SET app.schema_snapshot_replay = 'ci-empty-replay';\\n\")");
    expect(replayScript).toContain("marker remains session-local through the");
    expect(replayScript).toContain("session_user AS login_role, current_user AS replay_role");
    expect(replayScript).toContain("rolsuper FROM pg_roles WHERE rolname = session_user");
    expect(replayScript).toContain("rolsuper FROM pg_roles WHERE rolname = current_user");
    expect(replayScript).toContain('admin_netloc = f"{userinfo}@{authority_host}:{port}"');
    expect(replayScript).toContain('role=%s, superuser=%s');
    expect(replayScript).not.toContain("GRANT supabase_admin TO postgres");
    expect(replayScript).not.toContain("REVOKE supabase_admin FROM postgres");
    expect(replayScript).not.toContain("CREATE ROLE");
    expect(replayScript).toContain('readonly RLS_HARDENING_MIGRATION_NAME="20261024193934_rls_guard_missing_public_tables.sql"');
    expect(replayScript).toContain('readonly TENANT_MIGRATION_NAME="20261024193935_sandbox_tenant_isolation.sql"');
    expect(replayScript).toContain('readonly GUARD_PROBE_NAME="20261024193936_sandbox_schema_guard_probe.sql"');
    expect(replayScript).toContain('readonly UNMARKED_PROBE_NAME="20261024193937_sandbox_schema_unmarked_guard_probe.sql"');
    expect(replayScript).toContain("--runtime native");
    expect(replayScript).toContain("--exclude rest,auth,realtime,storage,functions,studio,mail,analytics,pooler");
    expect(replayScript).toContain('"$CLI" --workdir "$CI_WORKDIR" stack stop --stack "$PROJECT_ID"');
    expect(replayScript).not.toContain("docker ps -a");
    expect(replayScript).not.toContain("docker info");
    expect(replayScript).toContain("SUPABASE_ACCESS_TOKEN");
    expect(replayScript).toContain('unset LOCAL_DB_URL');
    expect(replayScript).not.toContain("ALTER DATABASE postgres SET app.schema_snapshot_replay");
    expect(replayScript).not.toContain("ALTER DATABASE postgres RESET app.schema_snapshot_replay");
    expect(replayScript).toContain("Refusing current-state schema baseline");
    expect(replayScript.indexOf('"$CLI" --workdir "$CI_WORKDIR" stack start'))
      .toBeLessThan(replayScript.indexOf("target.write(b\"SET app.schema_snapshot_replay"));
    const replayMarkerIndex = replayScript.indexOf("target.write(b\"SET app.schema_snapshot_replay");
    const markedBaselineReplayIndex = replayScript.indexOf(
      'migration up --db-url "$LOCAL_DB_URL"',
      replayMarkerIndex
    );
    expect(replayMarkerIndex).toBeGreaterThanOrEqual(0);
    expect(markedBaselineReplayIndex).toBeGreaterThan(replayMarkerIndex);
    expect(replayScript).not.toContain("db reset --linked");
    expect(replayScript).not.toContain("db push");
  });

  it("isolates the optional Vite refresh, runs focused guards before resolution, and verifies all outputs", () => {
    const viteJob = workflow.match(/  vite-refresh:([\s\S]*)$/)?.[1] ?? "";
    expect(viteJob).toContain("if: ${{ inputs.resolution_mode == 'vite-refresh' }}");
    expect(viteJob).toContain("runs-on: ubuntu-latest");
    expect(viteJob).toContain("timeout-minutes: 15");
    expect(viteJob).toContain("contents: read");
    expect(viteJob).toContain("persist-credentials: false");
    expect(viteJob).toContain("EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(viteJob).toContain("DISPATCH_SHA: ${{ github.sha }}");
    expect(viteJob).toContain("DISPATCH_REF: ${{ github.ref }}");
    expect(viteJob).toContain("branch='codex/owner-isolated-validation-20261023'");
    expect(viteJob).toContain('[[ "$GITHUB_REF" == "refs/heads/$branch" ]]');
    expect(viteJob).toContain('[[ "$DISPATCH_REF" == "refs/heads/$branch" ]]');
    expect(viteJob).toContain("[[ \"$EXPECTED_SHA\" =~ ^[0-9a-f]{40}$ ]]");
    expect(viteJob).toContain("[[ \"$DISPATCH_SHA\" == \"$head_sha\" ]]");
    expect(viteJob).toContain("[[ \"$EXPECTED_SHA\" == \"$head_sha\" ]]");
    expect(viteJob).toContain("version: 9.15.9");
    expect(viteJob).toContain('node-version: "22"');

    const actions = [...viteJob.matchAll(/^\s+uses:\s*(\S+)/gm)].map((match) => match[1]);
    expect(actions).toEqual([
      "actions/checkout@v7",
      "pnpm/action-setup@v6",
      "actions/setup-node@v7",
    ]);

    const branchGuard = viteJob.indexOf("Require the candidate branch and exact SHA");
    const pnpmSetup = viteJob.indexOf("Setup pnpm 9.15.9");
    const baseInstall = viteJob.indexOf("pnpm install --frozen-lockfile --ignore-scripts");
    const networkIsolation = viteJob.indexOf("Verify loopback-only namespace for focused Vite guards");
    const focusedTests = viteJob.indexOf("tests/ci-vite-temporary-rollup-override.test.ts tests/ci-vite-lockfile-core.test.ts tests/ci-vite-lockfile-cli.test.ts tests/ci-isolated-workflow-contract.test.ts");
    const resolver = viteJob.indexOf("node scripts/ci/resolve-vite-with-baseline-rollup.cjs");
    const projection = viteJob.indexOf("node scripts/ci/project-vite-lockfile-refresh.cjs\n");
    const frozenInstall = viteJob.indexOf("pnpm install --frozen-lockfile --ignore-scripts", projection);
    const verify = viteJob.indexOf("node scripts/ci/project-vite-lockfile-refresh.cjs --verify");
    expect(branchGuard).toBeGreaterThanOrEqual(0);
    expect(pnpmSetup).toBeGreaterThan(branchGuard);
    expect(baseInstall).toBeGreaterThan(pnpmSetup);
    expect(networkIsolation).toBeGreaterThan(baseInstall);
    expect(focusedTests).toBeGreaterThan(networkIsolation);
    expect(resolver).toBeGreaterThan(focusedTests);
    expect(viteJob).toContain("BASE_SHA: ${{ inputs.expected_sha }}");
    expect(viteJob).not.toContain("pnpm update vite@6.4.5");
    expect(projection).toBeGreaterThan(resolver);
    expect(frozenInstall).toBeGreaterThan(projection);
    expect(verify).toBeGreaterThan(frozenInstall);
    expect(viteJob).toContain("sudo unshare --net");
    expect(viteJob).toContain('ip link set lo up && test "$(ip -o link show | wc -l)" -eq 1');
    expect(viteJob).toContain("--preserve-env=PATH,HOME,CI,NODE_ENV");
    expect(viteJob).not.toContain("--no-optional");

    for (const [envName, outputName] of [
      ["EXPECTED_BASE_MANIFEST_SHA256", "base_manifest_sha256"],
      ["EXPECTED_RAW_MANIFEST_SHA256", "raw_manifest_sha256"],
      ["EXPECTED_PROJECTED_MANIFEST_SHA256", "projected_manifest_sha256"],
      ["EXPECTED_BASE_LOCKFILE_SHA256", "base_lockfile_sha256"],
      ["EXPECTED_RAW_LOCKFILE_SHA256", "raw_lockfile_sha256"],
      ["EXPECTED_PROJECTED_LOCKFILE_SHA256", "projected_lockfile_sha256"],
    ]) {
      expect(viteJob).toContain(`${envName}: \${{ steps.vite-lockfile-projection.outputs.${outputName} }}`);
    }
    expect(viteJob).not.toMatch(/\bsecrets\.|cache:|upload-artifact|git push|git commit|pnpm (?:build|typecheck)\b/i);
    expect(viteJob).not.toContain("project-targeted-lockfile-refresh.cjs");
    const oldRefreshJob = workflow.match(/  lockfile-refresh:([\s\S]*?)(?=\n  vite-refresh:|$)/)?.[1] ?? "";
    expect(oldRefreshJob).toContain("pnpm update --depth 99 --lockfile-only --no-save --ignore-scripts follow-redirects hono");
  });

  it("uses local placeholders and avoids cache, provider credentials, and deployments", () => {
    expect(workflow).toContain("http://127.0.0.1:54321");
    expect(workflow).toContain("postgresql://local:local@127.0.0.1:54322/local_ci");
    expect(workflow).not.toMatch(/\bsecrets\./i);
    const checksJob = workflow.match(/  static-and-unit:([\s\S]*?)(?=\n  schema-replay:|$)/)?.[1] ?? "";
    const actions = [...checksJob.matchAll(/^\s+uses:\s*(\S+)/gm)].map((match) => match[1]);
    expect(actions).toEqual([
      "actions/checkout@v7",
      "pnpm/action-setup@v6",
      "actions/setup-node@v7",
    ]);
    expect(workflow).not.toMatch(/^\s*cache:/m);
    expect(workflow).not.toMatch(/\b(STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|E2E_TARGET_SUPABASE_PROJECT_REF|VERCEL_TOKEN)\b/);
  });

  it("excludes only the remote PostgreSQL suites from isolated CI through the web project config", () => {
    const webProjectStart = vitestConfig.indexOf('name: "web"');
    const mobileProjectStart = vitestConfig.indexOf('name: "mobile"');
    expect(webProjectStart).toBeGreaterThanOrEqual(0);
    expect(mobileProjectStart).toBeGreaterThan(webProjectStart);
    const webProjectConfig = vitestConfig.slice(webProjectStart, mobileProjectStart);
    expect(webProjectConfig).toContain('process.env.CI_ISOLATED === "1"');
    expect(webProjectConfig).toContain('"tests/saas-preview-regularization-pg.test.ts"');
    expect(webProjectConfig).toContain('"tests/saas-preview-readonly-boundaries-pg.test.ts"');
    expect(webProjectConfig).not.toContain("--exclude");

    const unitStep = workflow.match(/- name: Unit tests\n([\s\S]*?)(?=\n      - name:|$)/)?.[1] ?? "";
    expect(unitStep).toContain('CI_ISOLATED: "1"');
    expect(unitStep).toMatch(/--preserve-env=[^\n]*\bCI_ISOLATED\b/);
    expect(unitStep).toContain("pnpm vitest run");
    expect(unitStep).not.toContain("--exclude");
  });

  it("keeps Drizzle schema and SQL implementations real in shared test setup", () => {
    expect(sharedSetup).not.toMatch(/vi\.mock\(\s*["']drizzle-orm(?:\/pg-core)?["']/);
  });

  it("keeps static gates and runs checks in the network namespace", () => {
    const checksJob = workflow.match(/  static-and-unit:([\s\S]*?)(?=\n  schema-replay:|$)/)?.[1] ?? "";
    expect(workflow).toContain("sudo unshare --net");
    expect(workflow).toContain('ip link set lo up && test "$(ip -o link show | wc -l)" -eq 1');
    expect(checksJob.match(/run: sudo --preserve-env=[^\n]* unshare --net -- bash -euc/g)).toHaveLength(8);
    for (const check of [
      "pnpm exec vitest run tests/ci-isolated-workflow-contract.test.ts",
      "python3 scripts/ci/test_install_pinned_supabase_cli.py",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm vitest run",
      "pnpm validate:rls",
      "pnpm check:migrations",
      "pnpm gate:all",
    ]) {
      expect(workflow).toContain(check);
    }
    expect(workflow.match(/if: always\(\) && !cancelled\(\) && steps\.dependencies\.outcome == 'success' && steps\.network-isolation\.outcome == 'success'/g)).toHaveLength(8);
    expect(workflow).not.toMatch(/continue-on-error:/);
  });

  it("includes a semantic, fail-closed lockfile guard and focused guard cases", () => {
    expect(lockfileGuard.MAX_GIT_OUTPUT_BYTES).toBe(4 * 1024 * 1024);
    expect(lockfileGuard.TARGET_VERSIONS.map(({ name, from, to }) => ({ name, from, to }))).toEqual([
      { name: "follow-redirects", from: "1.16.0", to: "1.16.1" },
      { name: "hono", from: "4.13.7", to: "4.13.13" },
    ]);
    expect(lockfileGuard.assertGitOutputWithinLimit).toBeTypeOf("function");
    expect(lockfileGuard.assertExpectedGitStatus).toBeTypeOf("function");
    expect(lockfileGuard.execGit).toBeTypeOf("function");
    expect(lockfileGuard.validateLockfileRefresh).toBeTypeOf("function");
  });
});
