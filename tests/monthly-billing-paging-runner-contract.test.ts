import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizePostgresQuery } from "../scripts/lib/postgres-query-normalization";

const runner = readFileSync(
  resolve(process.cwd(), "scripts/run-zaltyko-monthly-billing-paging-local.sh"),
  "utf8"
);
const verifier = readFileSync(
  resolve(
    process.cwd(),
    "scripts/verify-zaltyko-monthly-billing-paging-local.ts"
  ),
  "utf8"
);
const financialVerifier = readFileSync(
  resolve(
    process.cwd(),
    "scripts/verify-zaltyko-monthly-financial-controls-local.ts"
  ),
  "utf8"
);
const optionsVerifier = readFileSync(
  resolve(
    process.cwd(),
    "scripts/verify-zaltyko-monthly-invoice-options-local.ts"
  ),
  "utf8"
);
const retentionVerifier = readFileSync(
  resolve(
    process.cwd(),
    "scripts/verify-zaltyko-retention-location-batches-local.ts"
  ),
  "utf8"
);
const verifierWatchdog = readFileSync(
  resolve(process.cwd(), "scripts/run-zaltyko-verifier-with-deadline.py"),
  "utf8"
);

describe("monthly billing paging local runner contract", () => {
  it("matches quoted and unquoted PostgreSQL identifiers consistently", () => {
    expect(
      normalizePostgresQuery(
        'INSERT INTO "zaltyko"."payments" ("id") VALUES ($1)'
      )
    ).toBe(
      normalizePostgresQuery("insert into zaltyko.payments (id) values ($1)")
    );
  });

  it("requires an isolated PostgreSQL 17 cluster bound to loopback", () => {
    expect(runner).toContain("mktemp -d /tmp/zaltyko-monthly-paging.");
    expect(runner).toContain("trap cleanup EXIT");
    expect(runner).toContain('"-h 127.0.0.1 -p ${PG_PORT}');
    expect(runner).toContain('if [[ "${version}" != "17" ]]');
    expect(runner).toContain('env -i "PATH=${SAFE_PATH}"');
    expect(runner).toContain('"HOME=${RUN_DIR}"');
    expect(runner).toContain('?statement_timeout=8000&lock_timeout=4000"');
    expect(runner).toContain("DOTENV_CONFIG_PATH=/dev/null");
    expect(runner).not.toMatch(/supabase\.co|vercel\.app|stripe\.com/i);
  });

  it("validates cleanup before deleting the disposable cluster", () => {
    expect(runner).toContain("PG_START_ATTEMPTED=1");
    expect(runner).toContain("Refusing to remove unexpected temporary path");
    expect(runner).toContain('rm -rf -- "${RUN_DIR}"');
    expect(runner.indexOf('pg_ctl -D "${PG_DATA}" -m fast stop')).toBeLessThan(
      runner.indexOf('rm -rf -- "${RUN_DIR}"')
    );
    expect(runner).toContain("recovery path: ${RUN_DIR}");
    expect(runner).toContain(
      'if ((status != 3)) || [[ -f "${PG_DATA}/postmaster.pid" ]]'
    );
  });

  it("dispatches only the allowlisted options verifier without changing the default case", () => {
    expect(runner).toContain(
      'case "${ZALTYKO_MONTHLY_BILLING_PAGING_CASE:-full}" in'
    );
    expect(runner).toContain(
      'full)\n    VERIFIER_SCRIPT="scripts/verify-zaltyko-monthly-billing-paging-local.ts"'
    );
    expect(runner).toContain(
      'options)\n    VERIFIER_SCRIPT="scripts/verify-zaltyko-monthly-invoice-options-local.ts"'
    );
    expect(runner).toContain(
      'financial)\n    VERIFIER_SCRIPT="scripts/verify-zaltyko-monthly-financial-controls-local.ts"'
    );
    expect(runner).toContain(
      'retention)\n    VERIFIER_SCRIPT="scripts/verify-zaltyko-retention-location-batches-local.ts"'
    );
    expect(runner).toContain(
      "Unsupported local harness case; allowed values: full, options, financial, retention"
    );
    expect(runner).toContain('"${VERIFIER_SCRIPT}"');
    expect(runner).toContain('if [[ "${MIGRATION_PROFILE}" == "retention" ]]');
    for (const migration of [
      "20261006080702_establish_zaltyko_domain_foundation.sql",
      "20261006085254_add_operational_enrollment_invariants.sql",
      "20261006094607_add_versioned_metric_engine.sql",
      "20261006165917_owner_cohort_retention_projections.sql",
    ]) {
      expect(runner).toContain(migration);
      expect(retentionVerifier).not.toContain(migration);
    }
    expect(runner).toContain("if ((USE_VERIFIER_WATCHDOG == 1)); then");
    expect(runner).toContain(
      'python3 -I "${ROOT_DIR}/scripts/run-zaltyko-verifier-with-deadline.py" --'
    );
    const retentionDispatch = runner
      .slice(runner.lastIndexOf("if ((USE_VERIFIER_WATCHDOG == 1)); then"))
      .split("\nelse\n")[0];
    expect(retentionDispatch).toContain(
      '"${NODE_BIN}" "${TSX_CLI_REALPATH}" "${ROOT_DIR}/${VERIFIER_SCRIPT}"'
    );
    expect(retentionDispatch).not.toMatch(/pnpm|corepack|npx/);
    expect(runner).toContain('NODE_BIN="$(command -v node || true)"');
    expect(runner).toContain(
      'TSX_CLI="${ROOT_DIR}/node_modules/tsx/dist/cli.mjs"'
    );
    expect(runner).toContain('TSX_LOCK_VERSION="$(awk');
    expect(runner).toContain(
      '"${TSX_INSTALLED_VERSION}" != "${TSX_LOCK_VERSION}"'
    );
    expect(runner).toContain(
      '"${TSX_CLI_REALPATH}" != "${TSX_PACKAGE_ROOT}/dist/cli.mjs"'
    );
    expect(verifierWatchdog).toContain("VERIFIER_DEADLINE_SECONDS = 8.0");
    expect(verifierWatchdog).toContain("start_new_session=True");
    expect(verifierWatchdog).toContain("os.killpg");
    expect(optionsVerifier).toContain("getMonthlyInvoiceOptions({");
    expect(optionsVerifier).toContain('servicePeriod: "2026-10"');
    expect(optionsVerifier).toContain(
      'process.env.DOTENV_CONFIG_PATH, "/dev/null"'
    );
    expect(optionsVerifier).toContain(
      'assert.equal(parsed.hostname, "127.0.0.1")'
    );
    expect(optionsVerifier).toContain("const BASE_ATHLETES_AND_PLANS = 201");
    expect(optionsVerifier).toContain("const ACTIVE_ENROLLMENTS = 202");
    expect(optionsVerifier).toContain("coverage_pair_count");
    expect(optionsVerifier).not.toMatch(
      /recordManualPaymentForCharge|verifyConcurrentPaymentReplay/
    );
    expect(runner).not.toMatch(/supabase\.co|vercel\.app|stripe\.com/i);
  });

  it("verifies the real retention builder across paged locations and retries", () => {
    expect(retentionVerifier).toContain("buildRetentionCohortProjections({");
    expect(retentionVerifier).toContain(
      "loadActiveLocationSnapshot(ORGANIZATION_ID)"
    );
    expect(retentionVerifier).toContain("const ACTIVE_LOCATION_COUNT = 501");
    expect(retentionVerifier).toContain(
      "const PROJECTION_RUN_COUNT = ACTIVE_LOCATION_COUNT + 1"
    );
    expect(retentionVerifier).toContain(
      "projectionRows: EXPECTED_PROJECTION_ROWS"
    );
    expect(retentionVerifier).toContain("batchBoundaries: [500, 2]");
    expect(retentionVerifier).toContain(
      "locationSnapshotPages: [200, 200, 101]"
    );
    expect(retentionVerifier).toContain(
      "where organization_id = $1 and is_active"
    );
    expect(retentionVerifier).toContain(
      "/Retention projection requires a successful metric run/"
    );
    expect(retentionVerifier).toContain(
      'idempotentRetry: "no new projection rows"'
    );
    expect(retentionVerifier).toContain("const STATEMENT_TIMEOUT_MS = 8_000");
    expect(retentionVerifier).toContain("const LOCK_TIMEOUT_MS = 4_000");
  });

  it("runs Node and Python prechecks without inherited interpreter options", () => {
    expect(runner).toContain(
      'env -i "PATH=${SAFE_PATH}" "HOME=${RUN_DIR}" LC_ALL=C python3 -I "$@"'
    );
    expect(runner).toContain(
      'env -i "PATH=${SAFE_PATH}" "HOME=${RUN_DIR}" LC_ALL=C "${NODE_BIN}" "$@"'
    );
    expect(runner).toContain(
      'python3 -I "${ROOT_DIR}/scripts/run-zaltyko-verifier-with-deadline.py"'
    );

    const pythonFunction = runner.match(
      /python_clean\(\) \{([\s\S]*?)\n\}/
    )?.[1];
    const nodeFunction = runner.match(/node_clean\(\) \{([\s\S]*?)\n\}/)?.[1];
    expect(pythonFunction).toBeDefined();
    expect(nodeFunction).toBeDefined();

    const path = process.env.PATH ?? "/usr/bin:/bin";
    const pythonMock = `
      SAFE_PATH=${JSON.stringify(path)}
      RUN_DIR="/tmp"
      python_clean() {${pythonFunction}\n}
      python_clean -c 'import os; assert "PYTHONPATH" not in os.environ; assert "PYTHONSTARTUP" not in os.environ'
    `;
    const nodeMock = `
      SAFE_PATH=${JSON.stringify(path)}
      RUN_DIR="/tmp"
      NODE_BIN=${JSON.stringify(process.execPath)}
      node_clean() {${nodeFunction}\n}
      node_clean -e 'if (process.env.NODE_OPTIONS) process.exit(23)'
    `;

    expect(() =>
      execFileSync("bash", ["-c", pythonMock], {
        env: {
          ...process.env,
          PYTHONPATH: "/tmp/untrusted-python-path",
          PYTHONSTARTUP: "/tmp/untrusted-python-startup",
        },
      })
    ).not.toThrow();
    expect(() =>
      execFileSync("bash", ["-c", nodeMock], {
        env: {
          ...process.env,
          NODE_OPTIONS: "--require=/tmp/untrusted-node-preload.js",
        },
      })
    ).not.toThrow();
  });

  it("loads actual paginated service readers with deterministic synthetic cases", () => {
    expect(verifier).toContain("loadMonthlyFamilyMemberships");
    expect(verifier).toContain("loadPricePlanCoverage");
    expect(verifier).toContain("loadIssuedLines");
    expect(verifier).toContain("loadMonthlyChargeState");
    expect(verifier).toContain("loadMonthlyReplayState");
    expect(verifier).toContain("ROW_COUNT = 205");
    expect(verifier).toContain("generate_series(1, ${ROW_COUNT})");
    expect(verifier).toContain("const SNAPSHOT_ROW_COUNT = ROW_COUNT * 2 - 1");
    expect(verifier).toContain("from generate_series(2, ${ROW_COUNT}) as n");
    expect(verifier).toContain("snapshotsOnFirstLine");
    expect(verifier).toContain("assert.equal(lines.length, ROW_COUNT)");
    expect(verifier).toContain(
      "assert.equal(remainingLines.length, ROW_COUNT - 1)"
    );
    expect(verifier).toContain("Las otras líneas deben conservar su snapshot");
    expect(verifier).toContain(
      "assert.equal(result.rows[0]?.count, originalCount)"
    );
    expect(verifier).toContain("recordManualPaymentForCharge({");
    expect(verifier).toContain("pg_blocking_pids(replay.pid)");
    expect(verifier).toContain("activity_lock.locktype = 'advisory'");
    expect(verifier).toContain("activity_lock.granted = false");
    expect(verifier).toContain("activity.application_name = $1");
    expect(verifier).toContain("LOCAL_PG_STATEMENT_TIMEOUT_MS = 8_000");
    expect(verifier).toContain("LOCAL_PG_LOCK_TIMEOUT_MS = 4_000");
    expect(verifier).toContain("OBSERVATION_DEADLINE_MS = 3_000");
    expect(verifier).toContain("ACTIVITY_QUERY_TIMEOUT_MS = 500");
    expect(verifier).toContain("ACTIVITY_CONNECT_TIMEOUT_MS = 1_000");
    expect(
      verifier.match(/Date\.now\(\) \+ OBSERVATION_DEADLINE_MS/g)
    ).toHaveLength(1);
    expect(verifier).toMatch(
      /waitForPaymentBarrier\(\s*activityPool,\s*observationDeadline\s*\)/
    );
    expect(verifier).toMatch(
      /waitForReplayBlockedByPayment\(\s*activityPool,\s*paymentWaiter\.pid,\s*observationDeadline\s*\)/
    );
    expect(verifier).toContain(
      "statement_timeout: LOCAL_PG_STATEMENT_TIMEOUT_MS"
    );
    expect(verifier).toContain("lock_timeout: LOCAL_PG_LOCK_TIMEOUT_MS");
    expect(verifier).toContain('parsed.searchParams.get("statement_timeout")');
    expect(verifier).toContain("connectionTimeoutMillis: 10_000");
    expect(verifier).not.toMatch(
      /update zaltyko\.(charges|invoices) set status/
    );
    expect(verifier).toContain("rollback synthetic snapshot cut");
    expect(verifier).toContain('hostname, "127.0.0.1"');
    expect(verifier).toContain(
      "parsed.port, process.env.ZALTYKO_MONTHLY_BILLING_PAGING_PORT"
    );
  });

  it("defines local PostgreSQL service checks for billing replay and authorization", () => {
    expect(financialVerifier).toContain(
      'process.env[LOCAL_ONLY], "1", "Local harness flag is required"'
    );
    expect(financialVerifier).toContain('assertLoopbackUrl("DATABASE_URL")');
    expect(financialVerifier).toContain('"statement_timeout"');
    expect(financialVerifier).toContain('"lock_timeout"');
    expect(financialVerifier).toContain("OBSERVATION_DEADLINE_MS = 3_000");
    expect(financialVerifier).toContain("APPLICATION_NAME");
    expect(runner).toContain(
      'DATABASE_APPLICATION_NAME="zaltyko_monthly_financial"'
    );
    expect(runner).toContain(
      "supabase/fixtures/zaltyko_synthetic_academies.sql"
    );
    expect(financialVerifier).toContain("getMonthlyInvoiceOptions({");
    expect(financialVerifier).toContain("issueMonthlyInvoice(homeCommand)");
    expect(financialVerifier).toContain(
      "recordManualPaymentForCharge(paymentCommand)"
    );
    expect(financialVerifier).toContain('"IDEMPOTENCY_CONFLICT"');
    expect(financialVerifier).toContain('"LOCATION_SCOPE_DENIED"');
    expect(financialVerifier).toContain('"FORBIDDEN"');
    expect(financialVerifier).toContain("readFinancialCounts(pool");
    expect(financialVerifier).toContain(
      'scope: "service-level PostgreSQL only; no HTTP route invoked"'
    );
    expect(financialVerifier).not.toMatch(/fetch\(|\/api\/v1\/owner/);
    expect(runner).toContain('if [[ "${MIGRATION_PROFILE}" == "retention" ]]');
  });
});
