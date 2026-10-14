# Paginación de replay mensual — 14-10-2026

## Resultado

- Rama `codex/monthly-billing-a2-paging-20261014`, basada en `148e4e55`.
- El replay bloquea y lee cargos por páginas ordenadas; después vuelve a leer la factura sin `FOR UPDATE` sobre ella. Ambos caminos reutilizan esa lectura. La factura anulada conserva `INVOICE_VOIDED`, incluso cuando la factura ya existente no coincide con la selección de replay.
- Se exportaron los lectores ya paginados de miembros familiares, cobertura de tarifa, líneas/snapshots y cargos para que las pruebas ejerciten las mismas consultas que consume el servicio. No se cambió `buildMonthlyInvoiceOptions()` ni su límite diferido.

## Evidencia local

- Historial de ejecución anterior a las correcciones QA: con `HEAD 1716b03c` y cambios del harness aún sin commit, `pnpm test:zaltyko-monthly-billing-paging:local` terminó con código 1 al detectar PostgreSQL 14.20; `initdb` no llegó a arrancar y la limpieza dio PASS.
- En esa misma versión anterior, `PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" pnpm test:zaltyko-monthly-billing-paging:local` terminó con código 0 y limpieza PASS. Esa ejecución usaba una sola plantilla para las 205 coberturas y simulaba el pago con SQL directo. Por tanto, queda sustituida como evidencia del fixture íntegro y del flujo real de pago.
- Intento previo de invocación directa: `PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" scripts/run-zaltyko-monthly-billing-paging-local.sh` terminó con código 126 (`zsh: permission denied`) antes de iniciar el script. No hubo PostgreSQL ni se ejecutó el hook de limpieza.
- Ejecución única del harness corregido: `PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" bash scripts/run-zaltyko-monthly-billing-paging-local.sh`, en `HEAD c41dd5e7644445e06d90a08beb5639dca3848d72` limpio, terminó con código 0 usando PostgreSQL 17.11 (`initdb`, `postgres`, `pg_ctl`, `psql`) y `monthly billing paging cleanup: PASS`.
- El resultado confirmó 205 líneas, 409 snapshots (205 en la primera línea), 205 cargos y lectores de 205 filas. El pago concurrente fue real: `recordManualPaymentForCharge()` completó mientras el replay esperaba el bloqueo; se observó factura `partially_paid` y estado agregado `mixed`. El corte sintético dejó la primera línea sin snapshots, se revirtió y la consulta SQL confirmó los 409 snapshots restaurados en 205 líneas.
- Verificación posterior: HEAD y árbol siguieron intactos; no quedó proceso del runner ni directorio temporal `zaltyko-monthly-paging.*`.
- El interleaving identifica la espera por `application_name`, PID y advisory lock exacto, y confirma que el replay queda bloqueado por esa conexión sobre la consulta de cargos `FOR UPDATE`. La comparación normaliza identificadores SQL entrecomillados y sin comillas. El pool del servicio usa `statement_timeout=8000` y `lock_timeout=4000`; el pool de actividad limita consultas/bloqueos a 500 ms y conexión a 1 s. Ambas observaciones comparten un único plazo de 3 s iniciado justo antes del pago; al vencer, el `finally` libera la barrera antes de esperar operaciones con límites SQL.
- La prueba de corte de snapshot retira las 205 filas de la primera línea solo dentro de una transacción local con triggers de usuario deshabilitados; el lector expone esa línea sin snapshots mientras las otras 204 líneas conservan uno cada una. Se fuerza rollback y una consulta SQL comprueba que se restauran 409 snapshots en 205 líneas. No valida por sí sola la respuesta del endpoint ante corrupción manual.
- Tras las correcciones QA: 13/13 pruebas unitarias focales PASS; `pnpm typecheck`, ESLint, Prettier, `bash -n` del runner y `git diff --check` PASS. El harness se ejecutó una sola vez en PostgreSQL local desechable; no hubo sandbox, producción, red, navegador, E2E ni despliegue.

## Límites y bloqueos

- La evidencia histórica de pago concurrente invocó SQL directo y no el servicio de pagos; no se considera prueba del flujo de pago. El harness corregido invoca el servicio, pero queda sin ejecutar por el límite QA vigente.
- La ruta de anulación no se verificó. No se afirma que todos los escritores compartan un orden global libre de ciclos.
- No se ejecutaron sandbox, consultas a servicios externos, acceso a credenciales, red, navegador, E2E, runner ni despliegue durante la corrección QA. La ejecución histórica del runner fue local y usó fixtures sintéticos en un PostgreSQL ligado a `127.0.0.1`; no demuestra el resultado de la versión corregida.
