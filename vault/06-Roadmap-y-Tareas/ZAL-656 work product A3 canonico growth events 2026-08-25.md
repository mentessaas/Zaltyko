---
status: ready_for_review
owner: Engineering Lead
date: 2026-08-31
scope: local/sandbox
---

# ZAL-656 — Work product A3 canónico de growth events

Handoff técnico para la nueva revisión independiente de [ZAL-976](/ZAL/issues/ZAL-976) y [ZAL-977](/ZAL/issues/ZAL-977). Este documento describe evidencia local/sandbox; no es aprobación, no prueba producción y no sustituye los veredictos de QA ni Platform & Security.

## Artefactos restaurados

- `src/lib/growth/canonical.ts`: contrato puro, catálogo y validaciones de aliases, consentimiento, PII-like, scope, onboarding y reconciliación DB + Stripe test.
- `src/lib/growth/canonical-adapter.ts`: única frontera `server-only`; persiste `event_id` y la clave idempotente sin actualizar retries existentes.
- `src/lib/growth/reconciliation.ts`: reconciliación pura sobre filas y hechos sintéticos; reporta duplicados, eventos fuera de catálogo y discrepancias sin convertir intención en ingreso.
- `src/db/schema/growth-events.ts`: schema Drizzle con metadatos A3 nullable para conservar histórico.
- `supabase/migrations/20260825090000_growth_events_canonical_a3.sql`: migración aditiva e idempotente con checks e índices únicos; no aplicada remotamente.
- `tests/growth-canonical.test.ts`: suite focal de contrato/writer/reconciliación.
- `tests/fixtures/growth-reconciliation.ts`: fixture sintética con duplicado y discrepancias DB/Stripe test deliberadas.

## Evidencia literal

```text
$ ls -la src/lib/growth/canonical.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  17635 Aug 30 01:57 src/lib/growth/canonical.ts
$ wc -l src/lib/growth/canonical.ts
     608 src/lib/growth/canonical.ts
$ ls -la src/lib/growth/canonical-adapter.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4217 Aug 30 02:01 src/lib/growth/canonical-adapter.ts
$ wc -l src/lib/growth/canonical-adapter.ts
     143 src/lib/growth/canonical-adapter.ts
$ ls -la src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8002 Aug 29 02:55 src/lib/growth/reconciliation.ts
$ wc -l src/lib/growth/reconciliation.ts
     281 src/lib/growth/reconciliation.ts
$ ls -la src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2574 Aug 30 02:01 src/db/schema/growth-events.ts
$ wc -l src/db/schema/growth-events.ts
      81 src/db/schema/growth-events.ts
$ ls -la supabase/migrations/20260825090000_growth_events_canonical_a3.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2314 Aug 30 02:01 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ wc -l supabase/migrations/20260825090000_growth_events_canonical_a3.sql
      69 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ ls -la tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  11682 Aug 30 02:05 tests/growth-canonical.test.ts
$ wc -l tests/growth-canonical.test.ts
     385 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
14
$ ls -la tests/fixtures/growth-reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4680 Aug 29 02:40 tests/fixtures/growth-reconciliation.ts
$ wc -l tests/fixtures/growth-reconciliation.ts
     163 tests/fixtures/growth-reconciliation.ts
```

```text
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 f2ddfdee
f2ddfdee feat(growth): materialize canonical A3 collector artifacts

$ PATH=/opt/homebrew/bin:/usr/bin:/bin pnpm exec vitest run tests/growth-canonical.test.ts 2>&1 | tail -30
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ tests/growth-canonical.test.ts (14 tests) 12ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
 $ node --import tsx scripts/check-migrations-integrity.ts
[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas

$ pnpm exec prettier --check src/lib/growth/canonical.ts src/lib/growth/canonical-adapter.ts src/lib/growth/reconciliation.ts src/db/schema/growth-events.ts tests/growth-canonical.test.ts tests/fixtures/growth-reconciliation.ts
Checking formatting...
All matched files use Prettier code style!

$ pnpm exec eslint src/lib/growth/canonical.ts src/lib/growth/canonical-adapter.ts src/lib/growth/reconciliation.ts src/db/schema/growth-events.ts tests/growth-canonical.test.ts tests/fixtures/growth-reconciliation.ts --quiet

$ git diff --check
```

## Clasificación y siguiente acción

- Evidencia obtenida: local/sandbox únicamente. No se ejecutó migración remota, no se tocó producción ni Stripe live y no se leyeron secretos ni datos reales.
- La suite global de TypeScript mantiene errores preexistentes fuera de A3; no se usan para afirmar PASS del contrato focal.
- Siguiente acción: [QA](/ZAL/agents/c07d53ca-4c48-47e0-b7e1-0a91630d78f5) y [Platform & Security](/ZAL/agents/6909a098-7ef1-49e6-898c-2c8fb18183e6) deben repetir la revisión en sus subtareas y emitir veredictos independientes.
