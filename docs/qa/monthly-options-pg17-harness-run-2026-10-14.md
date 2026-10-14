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

El fixture recibió casts explícitos `::uuid` en el commit local separado `d49bc380d0c07247353a6a2708b9db1d5eb83e46`. Después pasaron el test focal del contrato (5/5), `pnpm typecheck`, `bash -n` y `git diff --check`. **El harness PG no se volvió a ejecutar**, así que el resultado del servicio después de la corrección permanece sin verificar.

Vault: no aplica; esta nota registra únicamente una ejecución local de QA de un harness sintético y no cambia producto, arquitectura ni dirección.
