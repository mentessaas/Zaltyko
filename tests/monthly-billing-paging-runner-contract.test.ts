import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
  it("requires an isolated PostgreSQL 17 cluster bound to loopback", () => {
    expect(runner).toContain("mktemp -d /tmp/zaltyko-monthly-paging.");
    expect(runner).toContain("trap cleanup EXIT");
    expect(runner).toContain('"-h 127.0.0.1 -p ${PG_PORT}');
    expect(runner).toContain('if [[ "${version}" != "17" ]]');
    expect(runner).toContain('env -i "PATH=${SAFE_PATH}"');
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
    expect(verifier).toContain("recordManualPaymentForCharge({");
    expect(verifier).toContain(
      'waitForBlockedQuery(pool, "insert into zaltyko.payments")'
    );
    expect(verifier).toContain('waitForBlockedQuery(pool, "charges")');
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
