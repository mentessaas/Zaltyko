# Paginación de replay mensual — 14-10-2026

## Resultado

- Rama `codex/monthly-billing-a2-paging-20261014`, basada en `148e4e55`.
- El replay bloquea y lee cargos por páginas ordenadas; después vuelve a leer la factura sin `FOR UPDATE` sobre ella. Ambos caminos reutilizan esa lectura. La factura anulada conserva `INVOICE_VOIDED`, incluso cuando la factura ya existente no coincide con la selección de replay.
- Se exportaron los lectores ya paginados de miembros familiares, cobertura de tarifa, líneas/snapshots y cargos para que las pruebas ejerciten las mismas consultas que consume el servicio. No se cambió `buildMonthlyInvoiceOptions()` ni su límite diferido.

## Evidencia local

- Historial de ejecución anterior a las correcciones QA: con `HEAD 1716b03c` y cambios del harness aún sin commit, `pnpm test:zaltyko-monthly-billing-paging:local` terminó con código 1 al detectar PostgreSQL 14.20; `initdb` no llegó a arrancar y la limpieza dio PASS.
- En esa misma versión anterior, `PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" pnpm test:zaltyko-monthly-billing-paging:local` terminó con código 0 y limpieza PASS. Esa ejecución usaba una sola plantilla para las 205 coberturas y simulaba el pago con SQL directo. Por tanto, queda sustituida como evidencia del fixture íntegro y del flujo real de pago.
- El harness corregido ahora crea 205 plantillas referenciadas individualmente y usa `recordManualPaymentForCharge()` con una barrera determinista de advisory lock para intercalar el replay. Esta versión corregida no se ha ejecutado.
- La prueba de corte de snapshot retira la fila solo dentro de una transacción local con triggers de usuario deshabilitados; el lector expone la línea incompleta, se fuerza rollback y se comprueba que las 205 filas continúan presentes. No valida por sí sola la respuesta del endpoint ante corrupción manual.
- Tras las correcciones QA: 11/11 pruebas unitarias focales PASS; `pnpm typecheck`, ESLint, Prettier, `bash -n` del runner y `git diff --check` PASS. No se ejecutó PostgreSQL, el runner ni E2E.

## Límites y bloqueos

- La evidencia histórica de pago concurrente invocó SQL directo y no el servicio de pagos; no se considera prueba del flujo de pago. El harness corregido invoca el servicio, pero queda sin ejecutar por el límite QA vigente.
- La ruta de anulación no se verificó. No se afirma que todos los escritores compartan un orden global libre de ciclos.
- No se ejecutaron sandbox, consultas a servicios externos, acceso a credenciales, red, navegador, E2E, runner ni despliegue durante la corrección QA. La ejecución histórica del runner fue local y usó fixtures sintéticos en un PostgreSQL ligado a `127.0.0.1`; no demuestra el resultado de la versión corregida.
