# Paginación de replay mensual — 14-10-2026

## Resultado

- Rama `codex/monthly-billing-a2-paging-20261014`, basada en `148e4e55`.
- El replay bloquea y lee cargos por páginas ordenadas; después vuelve a leer la factura sin `FOR UPDATE` sobre ella. Ambos caminos reutilizan esa lectura. La factura anulada conserva `INVOICE_VOIDED`, incluso cuando la factura ya existente no coincide con la selección de replay.
- Se exportaron los lectores ya paginados de miembros familiares, cobertura de tarifa, líneas/snapshots y cargos para que las pruebas ejerciten las mismas consultas que consume el servicio. No se cambió `buildMonthlyInvoiceOptions()` ni su límite diferido.

## Evidencia local

- `tests/monthly-invoice-replay-state.test.ts`, `tests/monthly-billing-paging-runner-contract.test.ts` y `tests/billing-keyset-pagination.test.ts`: 11/11 PASS. Incluyen resultados de más de 200 filas y cursores compuestos con filas en ambos lados del límite.
- `pnpm typecheck`, Prettier, `bash -n scripts/run-zaltyko-monthly-billing-paging-local.sh` y `git diff --check`: PASS.
- `pnpm test:zaltyko-monthly-billing-paging:local` con el PostgreSQL 17 local de Homebrew: PASS. Los lectores reales del servicio devolvieron 205 memberships, 205 coberturas, 205 líneas con 205 snapshots y 205 cargos. Una transacción SQL sintética actualizó un cargo y la factura mientras el replay esperaba el bloqueo; el replay observó `partially_paid` y el agregado `mixed`.
- El harness retiró temporalmente un snapshot con triggers de usuario deshabilitados solo dentro de una transacción local y verificó que el lector expuso la línea incompleta; después lanzó rollback y confirmó que los 205 snapshots seguían presentes. No valida por sí solo la respuesta del endpoint ante corrupción manual.
- `monthly billing paging cleanup: PASS`. El primer intento encontró PostgreSQL 14 y se detuvo antes de iniciar el servidor; el segundo antepuso el directorio local de PostgreSQL 17. No hubo descarga.

## Límites y bloqueos

- El pago concurrente se simuló con SQL en la transacción efímera; no se invocó la API/servicio de pago manual. La prueba confirma el interleaving relevante del orden cargo→factura observado en ese flujo, no todas las rutas financieras.
- La ruta de anulación no se verificó. No se afirma que todos los escritores compartan un orden global libre de ciclos.
- No hubo sandbox, credenciales, datos externos, red, navegador, E2E ni despliegue. El harness usa únicamente fixtures inventados en un PostgreSQL 17 ligado a `127.0.0.1` y elimina el clúster temporal tras confirmar que se detuvo.
