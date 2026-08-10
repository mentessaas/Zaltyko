# Changelog

All notable changes to Zaltyko are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/).

> SHA referenced corresponds to commits on `zaltyko-onboarding-ZAL-137`.
> For commits on previous branches, refer to the git history directly.

## 2026-08-10 — ZAL-556 static gates

### Added

- `scripts/gates/unbounded-reads.ts` — A2 gate detecting Drizzle-style
  list reads without `.limit(N)`, `.offset(M)` or `cursor`. Pure TS compiler
  API; uses regex only for the escape-hatch matcher. Reports file, line,
  rule, and actionable hint.
- `scripts/gates/auth-before-validate.ts` — A3 gate detecting handlers
  that parse or validate the body before any auth primitive in
  `src/app/api/**/route.ts`. Pure TS compiler API (no regex). Honour the
  outer wrapping HOFs (`withTenant`, `withSuperAdmin`) and the
  `@auth-flexible route-guard-reason:` escape hatch.
- `scripts/gates/lib/{walker,report}.ts` — shared walker + reporter.
- `scripts/gates/run-all.ts` — aggregate runner.
- `scripts/gates/__fixtures__/{positive,negative}/{unbounded,auth-order}`
  — manual fixtures for both gates.
- `scripts/gates/__tests__/gates.test.ts` — self-test runner that runs
  each gate in-process against the fixtures plus an end-to-end smoke test
  via `npx tsx`.
- `pnpm gate:reads`, `pnpm gate:reads:strict`, `pnpm gate:auth`,
  `pnpm gate:auth:strict`, `pnpm gate:all`, `pnpm gate:test`.
- `docs/audit/STATIC_GATES.md` — full operator guide, including limits
  and known false positives.

### Not changed

- `scripts/audit-api-routes.ts` — the existing auth-class/resource-scope
  audit is intentionally complementary, not a duplicate. The new gates
  cover two distinct risk classes (unbounded reads + body-validate
  before auth) that the existing audit does not.

### Operator notes

- Initial scan (SHA 3bef295af, branch `zaltyko-onboarding-ZAL-137`):
  - A2: 514 findings across 1.356 TS files.
  - A3: 28 findings across 245 `route.ts`.
- These are advisory by default. Use the `--strict` flag in CI to fail
  on any finding.
