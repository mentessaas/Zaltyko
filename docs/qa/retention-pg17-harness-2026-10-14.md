# Harness PG17 de retención — registro QA

## Corrida autorizada en `8642afd`

- Rama: `codex/retention-pg17-harness-20261014`; el checkout estaba limpio en `8642afd889a652485a678b269d55479c73d14a75`.
- Preflight: `initdb`, `postgres`, `pg_ctl` y `psql` reportaron PostgreSQL 17.11.
- Se lanzó una vez `PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" ZALTYKO_MONTHLY_BILLING_PAGING_CASE=retention bash scripts/run-zaltyko-monthly-billing-paging-local.sh`.
- Resultado: **FAIL**, exit `124`. El watchdog informó `Verifier exceeded 8s deadline; its process group was terminated`. No se obtuvo el JSON `PASS` del verificador, por lo que esta corrida no valida sus assertions de seed, snapshot o proyecciones.
- La salida del preparador de pnpm incluyó:

  ```text
  .../.tmp/pnpm-9.15.9-1792010591374 | Progress: resolved 1, reused 0, downloaded 0, added 0
  .../.tmp/pnpm-9.15.9-1792010591374 |   +1 +
  .../.tmp/pnpm-9.15.9-1792010591374 | Progress: resolved 1, reused 0, downloaded 1, added 1, done
  ```

- La salida acredita esa descarga/preparación en el directorio temporal de pnpm. No se comprobó si persistió fuera de ese directorio; tampoco se afirma que se instalaran dependencias del proyecto.
- El runner informó `monthly billing paging cleanup: PASS`. La comprobación posterior no encontró directorios `zaltyko-monthly-paging.*`; el HEAD y el árbol siguieron sin cambios. Se retiró el enlace temporal a `node_modules`.

## Correcciones estáticas posteriores

- `66bbe793ac12b27898e5c8ffa9c7813f765ef3ea` evita pnpm/Corepack/npx en la ruta retention y arranca Node con el CLI `tsx` local cuya versión y ruta se contrastan con `pnpm-lock.yaml`.
- `66bbe793ac12b27898e5c8ffa9c7813f765ef3ea` también ejecuta las comprobaciones Node con `env -i`, `PATH` explícito y `HOME` temporal; las comprobaciones Python usan `env -i`, `HOME` temporal y `python3 -I`. El watchdog Python recibe el mismo aislamiento.
- Los mocks focales inyectan `NODE_OPTIONS`, `PYTHONPATH` y `PYTHONSTARTUP` y verifican que no llegan a los intérpretes aislados.
- En ese commit pasaron 7/7 tests de contrato, 3/3 tests del watchdog, typecheck, `bash -n`, Prettier y `git diff --check`. Un smoke local del CLI devolvió `tsx v4.23.13` y `node v22.22.3`.
- No se volvió a ejecutar el runner ni PostgreSQL después de estas correcciones. El gate runtime sigue **NO VERIFICADO**.

## Límites

Esta evidencia no cubre rollback inyectado, concurrencia entre páginas del snapshot, CI, navegador, RLS con roles reales ni release GO. No demuestra deployment ni comportamiento de producción.
