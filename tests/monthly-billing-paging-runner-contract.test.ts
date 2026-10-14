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
});
