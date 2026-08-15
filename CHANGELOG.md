# Changelog

All notable changes to Zaltyko are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/).

> SHA referenced corresponds to commits on `zaltyko-onboarding-ZAL-137`.
> For commits on previous branches, refer to the git history directly.

## 2026-08-15 — ZAL-556 A3 alias/order hardening

### Cambios

- El gate A3 resuelve aliases declarados en el mismo `route.ts`,
  reconoce `withBearerTenant`, `requireAuth` y
  `supabase.auth.getUser(...)`, y compara posiciones AST para no ocultar
  una validación anterior a una autenticación posterior.
- El runner de gates y el harness focal usan `node --import tsx`,
  evitando el IPC local que el CLI de `tsx` rechaza con `EPERM`
  en este sandbox.
- Fixtures añadidos: alias no autenticado y doble validación (negativo), más
  alias bearer autenticado (positivo).

### Evidencia literal

Todo lo siguiente es local/sandbox; no es evidencia de producción, readiness,
adopción ni validación humana.

````text
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/package.json
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8823 Aug 15 12:32 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/package.json
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/package.json
     222 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/package.json
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/auth-before-validate.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 12593 Aug 15 12:30 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/auth-before-validate.ts
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/auth-before-validate.ts
     382 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/auth-before-validate.ts
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/lib/run-tsx.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 1982 Aug 15 12:32 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/lib/run-tsx.ts
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/lib/run-tsx.ts
      46 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/lib/run-tsx.ts
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/__fixtures__/negative/auth-order/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 2764 Aug 15 12:31 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/__fixtures__/negative/auth-order/route.ts
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/__fixtures__/negative/auth-order/route.ts
      60 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/__fixtures__/negative/auth-order/route.ts
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/__fixtures__/positive/auth-order/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 2961 Aug 15 12:31 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/__fixtures__/positive/auth-order/route.ts
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/__fixtures__/positive/auth-order/route.ts
      64 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/scripts/gates/__fixtures__/positive/auth-order/route.ts
$ ls -la /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/gates-static.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 1211 Aug 15 12:34 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/gates-static.test.ts
$ wc -l /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/gates-static.test.ts
      33 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/gates-static.test.ts
$ grep -c "  it(" /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko/tests/gates-static.test.ts
4
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 a36857b2f
a36857b2f fix(gates): resolve auth aliases before body validation

$ node --import tsx scripts/gates/__tests__/gates.test.ts
...
17/17 passed.

$ CI=1 pnpm exec vitest run tests/gates-static.test.ts --config vitest.gates.config.ts --reporter=verbose
...
 Test Files  1 passed (1)
      Tests  4 passed (4)
...
close timed out after 1000ms
Tests closed successfully but something prevents Vite server from exiting
````

No se tocaron producción, dominios, secretos, datos reales, Stripe live,
pricing, campañas, publicaciones, stores ni migraciones remotas.

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

## 2026-08-15 — ZAL-556 local re-verification after adapter handoff

### Verified

- The implementation commit `0233de493ebd913602816e66638d55b262af8477`
  remains an ancestor of the active `gates/ZAL-556` branch; later gate-runner
  hardening is also present.
- Fresh local scans report A2: 1,380 files / 515 findings; A3: 307
  `route.ts` files / 28 findings; A4: 65 `page.tsx` files / 0 findings.
  A2/A3 remain advisory because the current tree contains findings; strict
  mode correctly exits non-zero and reports file, line, rule, reason and hint.
- `pnpm gate:test` now exercises A2, A3, A4, the aggregate runner and retention:
  17/17 custom checks passed. The focal Vitest suite emitted `Tests  4 passed
  (4)`, then the local runner reported a close timeout; it is retained as a
  fixture contract but is not treated as an overall CI green result.
- No production, external domain, Stripe live, secrets, real data, pricing,
  campaigns, publications or remote migrations were touched. This is local
  evidence only and does not represent production readiness or human
  validation.
