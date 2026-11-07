import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Remote preview gate only. Unit/TLS tests plus rollback-only PostgreSQL checks
// restricted to the explicitly authorized, pre-existing synthetic sandbox.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30000,
    include: ["tests/db-pool-config.test.ts", "tests/saas-organization-usage.test.ts", "tests/saas-effective-entitlement.test.ts", "tests/saas-preview-regularization-pg.test.ts", "tests/saas-preview-readonly-boundaries-pg.test.ts", "tests/owner-groups-manager.test.tsx", "tests/charges-inserted-count.test.ts", "tests/charges-scope-idempotency-contract.test.ts", "tests/monthly-charges-international-contract.test.ts", "tests/saas-checkout-service.test.ts", "tests/saas-checkout-route.test.ts", "tests/saas-short-paid-checkout-envelope.test.ts", "tests/saas-short-paid-checkout-service.test.ts"],
  },
});
