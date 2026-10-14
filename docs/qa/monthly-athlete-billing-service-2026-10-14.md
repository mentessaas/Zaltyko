# Servicio de facturación mensual por gimnasta — 14-10-2026

## Alcance y estado

- **Branch:** `codex/monthly-athlete-billing-service-20261014`, creado desde Main `470bb151af1a7312c49661fe510a76e0ac445f56`.
- **Alcance:** servicio de cotización/emisión, ledger transaccional, harness local y este informe QA. Sin rutas, UI, cambios de esquema, base de datos remota ni despliegue.
- **Regla implementada:** una cuota mensual por gimnasta, sede y periodo. Las inscripciones activas de esa gimnasta deben compartir tarifa, importe snapshot y moneda, y cada inscripción debe tener cobertura de tarifa para todo el mes. Se emite una línea/cargo por gimnasta, con snapshots explícitos de todas las inscripciones, plantillas, clases y asignaciones cubiertas.

## Cambios verificados

- La cotización agrupa por atleta y omite la línea completa si detecta tarifa/importe/moneda incompatibles o cobertura incompleta; no selecciona una tarifa arbitrariamente ni prorratea.
- El ledger inserta `invoice_lines` y `invoice_line_enrollments` junto con el cargo, outbox y auditoría en la misma transacción. Las líneas nuevas mantienen `enrollment_id` nulo y snapshot de `athlete_id`; las líneas legacy siguen siendo legibles sin reescritura.
- La emisión revalida la cotización bajo bloqueos, verifica el alcance antes de escribir, admite replay idempotente y evita una segunda cuota del mismo atleta en la misma sede/mes incluso si cambia de familia y de inscripción.
- Los bloqueos de datos y la ausencia de cobertura se presentan como conflictos accionables; no se crean líneas parciales para la gimnasta afectada.

## Evidencia local

- `pnpm test:zaltyko-operations:local` — PASS. Salida final: `status=PASS`, una inscripción aceptada y otra `CAPACITY_FULL`, 2 sesiones, correcciones serializadas de asistencia en una fila, 41 eventos outbox, 41 auditorías y 10 entradas de historial.
- `pnpm exec vitest run tests/monthly-athlete-tariff-domain.test.ts tests/monthly-invoice-api.test.ts` — PASS, 2 archivos y 11 tests.
- `pnpm typecheck` — PASS.
- Prettier focal, `bash -n scripts/run-zaltyko-operational-services-local.sh` y `git diff --check` — PASS tras formateo final.
- El harness de operaciones ejecuta Postgres desechable local y aplica la migración existente de cobertura/tarifa y snapshots. No demuestra E2E autenticado en navegador, CI, sandbox, producción ni despliegue.

## Contrato API que debe actualizar el siguiente bloque

Los endpoints existentes son:

- `GET /api/v1/owner/billing/monthly-invoices/options`: cada familia devuelve `lines[]` con `athleteId`, `athleteName`, `pricePlanId`, `pricePlanName`, `amountCents`, `currency` y `coveredEnrollments[]` (`enrollmentId`, `classTemplateId`, `className`, `assignmentId`); también devuelve `conflicts[]`, totales y `quoteHash`.
- `POST /api/v1/owner/billing/monthly-invoices/issue`: el servicio devuelve una línea mensual por atleta con `athleteId`, `enrollmentId: null`, `pricePlanId`, nombre, importe, moneda y `coveredEnrollments[]`. La ruta hoy proyecta solo `enrollmentId`, `athleteName`, importe y moneda, así que el siguiente dueño de API/UI debe ampliar el DTO de respuesta y adaptar la vista previa y el resultado de emisión.

La petición de emisión conserva `organizationId`, `locationId`, `familyId`, `familyPayerId`, `servicePeriod`, `dueDate`, `quoteHash` y la cabecera `Idempotency-Key`; actor y tenant se derivan/verifican en servidor.

## Dependencias de producto/ownership pendientes

- No existe aún servicio/API/UI para gestionar las filas de cobertura tarifa↔plantilla. Mientras falte cobertura completa, la factura se bloquea; el bloque dueño de pricing debe crear y gobernar esa asignación.
- La actualización de DTO/rutas y la UI Owner quedan para el bloque Front/API indicado arriba. Este branch no modifica esos consumidores.
- Las opciones de facturación listan las familias disponibles; el alcance de sede y la política de vigencia completa del mes quedan reflejados en la cotización. No se añadió prorrateo.

## Límites

El resultado es evidencia local del servicio y sus transacciones. No acredita el flujo completo Owner en navegador, permisos efectivos de un entorno desplegado ni preparación de release.
