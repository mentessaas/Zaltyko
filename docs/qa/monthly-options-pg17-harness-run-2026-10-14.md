# Ejecución local del harness PG17 de opciones mensuales

**Fecha:** 2026-10-14  
**Alcance:** una ejecución del caso `options`, con fixtures sintéticos y PostgreSQL local desechable.  
**Commit bajo prueba:** `0501b1ad541cca0be4db1ea4d403625e06c85c67`  
**Resultado:** FAIL durante el seed. No se obtuvo JSON de verificación del servicio.

## Preflight observado

- Rama `codex/monthly-options-pg17-harness-20261014`; HEAD exacto `0501b1ad541cca0be4db1ea4d403625e06c85c67`; árbol limpio.
- `initdb`, `postgres`, `pg_ctl` y `psql` resolvieron dentro de `/opt/homebrew/opt/postgresql@17/bin/` y cada uno informó PostgreSQL 17.11.
- No había un proceso del runner ni directorios `/tmp/zaltyko-monthly-paging.*` antes de iniciar.
- El `node_modules` del checkout local autorizado se enlazó temporalmente después de comprobar que `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` y `.npmrc` coincidían. El enlace se retiró al terminar.

## Ejecución y resultado

Se ejecutó una sola vez, sin ampliar límites:

```bash
PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" \
  ZALTYKO_MONTHLY_BILLING_PAGING_CASE=options \
  bash scripts/run-zaltyko-monthly-billing-paging-local.sh
```

El seed se detuvo al insertar `zaltyko.people`. PostgreSQL devolvió:

```text
error: column "organization_id" is of type uuid but expression is of type text
code: 42804
at seed (.../scripts/verify-zaltyko-monthly-invoice-options-local.ts:47:3)
```

El `UNION ALL` del fixture había inferido como `text` las expresiones UUID interpoladas de `organization_id`. El runner informó `monthly billing paging cleanup: PASS` y terminó con **exit 1**. No se llamó al servicio `getMonthlyInvoiceOptions` y no existe resultado funcional que pueda declararse PASS.

Post-run: HEAD permaneció en el commit bajo prueba, el árbol siguió limpio y no quedaron directorios temporales del runner ni procesos PostgreSQL 17. El proceso preexistente PID 1729 corresponde a PostgreSQL 14 del sistema y no se utilizó.

## Seguimiento

El fixture recibió casts explícitos `::uuid` en el commit local separado `d49bc380d0c07247353a6a2708b9db1d5eb83e46`; el commit `4edc59dea209c296832eb709bc9a3d550542d342` completó los casts de enums y fechas. La corrida posterior se registra a continuación; el FAIL de `0501` se conserva como evidencia histórica de ese SHA.

## Corrida posterior autorizada

**Fecha/hora:** 2026-10-14 19:42:42.316 UTC

**Commit bajo prueba:** `4edc59dea209c296832eb709bc9a3d550542d342`

**Resultado:** PASS.

El preflight confirmó SHA exacto, árbol limpio, ausencia de otro runner/cluster residual y PostgreSQL 17.11 para los cuatro binarios (`initdb`, `postgres`, `pg_ctl`, `psql`) resueltos bajo `/opt/homebrew/opt/postgresql@17/bin/`. Se comprobó que `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` y `.npmrc` coincidían con el checkout local antes de enlazar temporalmente `node_modules`; el enlace se retiró al terminar.

Comando ejecutado una vez, sin ampliar timeouts:

```bash
PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" \
  ZALTYKO_MONTHLY_BILLING_PAGING_CASE=options \
  bash scripts/run-zaltyko-monthly-billing-paging-local.sh
```

Salida JSON del verificador:

```json
{"status":"PASS","service":"getMonthlyInvoiceOptions","monthlyPlans":201,"familiesWithAthletes":201,"includedEnrollments":203,"activeBillableEnrollments":202,"activeCoveragePairs":203,"excludedEnrollments":4,"pagination":"201 plans, 201 family-athlete rows, 203 enrollment reads, 203 coverage pairs","database":"disposable PostgreSQL 17 loopback only"}
```

El runner informó `monthly billing paging cleanup: PASS` y terminó con **exit 0**. Post-run: HEAD permaneció en `4edc59dea209c296832eb709bc9a3d550542d342`, el árbol quedó limpio y no quedaron directorios temporales ni procesos PostgreSQL 17. El proceso preexistente PID 1729 de PostgreSQL 14 permaneció sin uso.

Vault: no aplica; esta nota registra únicamente una ejecución local de QA de un harness sintético y no cambia producto, arquitectura ni dirección.
