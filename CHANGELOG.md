# Changelog

All notable changes to Zaltyko are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/).

> SHA referenced corresponds to commits on `zaltyko-onboarding-ZAL-137`.
> For commits on previous branches, refer to the git history directly.

## 2026-08-11 — ZAL-556 gate runner hardening

### Fixed

- `scripts/gates/run-all.ts` no longer shells out to `npx --no-install tsx`.
  `npx` resolution is cwd-sensitive and hangs reproducibly inside this repo
  (>7 min at 0% CPU, no child process spawned), which left `pnpm gate:all` —
  the CI entrypoint — unusable. tsx is now resolved through Node's own
  resolver (`require.resolve("tsx/cli")`) and run with `process.execPath`.
- `run-all.ts` conflated a gate that *found violations* with a gate that
  *failed to launch*: both collapsed into exit 1 via `proc.status ?? 1`. A
  launch failure is now reported explicitly on stderr.
- `gates.test.ts` spawned its end-to-end smoke tests with `cwd` set to the
  repo's **parent** directory (`path.join(ROOT, "..", "..", "..")` where
  `ROOT` is `scripts/gates`), so they never exercised the failing path.
- `gates.test.ts` asserted `status !== 0` for the negative fixtures. A spawn
  that never ran reports `status === null`, which satisfies that assertion —
  a total failure to execute scored as a pass. Now asserts `status === 1` and
  fails explicitly on launch errors.
- Removed a dead, non-functional `tsx` helper in `gates.test.ts`.

### Added

- `scripts/gates/lib/run-tsx.ts` — deterministic tsx invocation shared by the
  runner and the tests.
- Self-test coverage for `run-all.ts` itself (2 new cases, 10/10 total).
  Nothing previously covered the CI entrypoint, which is why a broken
  `gate:all` shipped twice behind a green self-test run.

### Notes

- 394 of the 1.356 `src/**/*.ts{,x}` files in the local working copy are
  iCloud-evicted (`compressed,dataless`); reading one blocks indefinitely at
  0% CPU. Full-tree local scans cannot complete until they are materialised.
  This affects `tsc` and `npx` equally and does not apply to CI. See
  `docs/audit/STATIC_GATES.md`.
- Re-measured over the 962 readable files: A2 = 401 findings, A3 = 21,
  proportionally consistent with the earlier full-tree 514 / 28.

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
  via `npx tsx` (replaced by a deterministic runner on 2026-08-11).
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
