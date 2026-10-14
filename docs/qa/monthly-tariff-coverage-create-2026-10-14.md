# Alta de tarifa mensual con cobertura — 14-10-2026

## Alcance

- **Branch:** `codex/monthly-tariff-coverage-create-20261014`, desde `e2345ea57d3131ac64e014c1f067e17192f4b658`.
- **Alcance:** creación de tarifa mensual, cobertura tarifa↔plantillas, ruta POST, pruebas focales y harness local. Sin cambios de esquema, factura, cotización, UI, E2E, remoto ni despliegue.
- **Contrato:** el POST conserva organización, sede, nombre, importe y moneda opcional; exige `coverage` con `classTemplateIds` UUID únicos (1–100), `startsOn` y `endsOn` opcional. Se permite inicio a mitad de mes; se rechazan fechas inexistentes y rangos invertidos.

## Comportamiento

- Autoriza owner/admin antes de leer o bloquear recursos. Comprueba que las plantillas estén activas, pertenezcan a la organización y sede, y tengan vigencia que se cruce con la cobertura solicitada.
- Normaliza los UUID de plantillas a minúsculas antes de comprobar duplicados, ordenar, calcular la huella o persistir; el cambio de casing no altera una creación ni su replay.
- Recomprueba que la sede siga activa bajo `FOR UPDATE`, antes de bloquear plantillas. Mantiene el orden de bloqueos de emisión mensual: sede y después plantillas.
- Inserta plan y todas sus coberturas en la misma transacción que outbox y auditoría. El evento conserva la cobertura ordenada por ID para el replay; auditoría y respuesta guardan IDs y fechas, sin nombres de clase ni datos de gimnastas.
- El mismo `Idempotency-Key` admite replay si coinciden parámetros y filas persistidas. La cobertura se normaliza por ID, así que el orden de la petición no altera el replay. Cambiar fechas, IDs o filas ya persistidas produce `409 IDEMPOTENCY_CONFLICT`.
- La ruta devuelve los campos de tarifa existentes y `coverage: [{ classTemplateId, startsOn, endsOn }]`; no devuelve líneas personales ni nombres de plantillas.

## Evidencia local

- `pnpm exec vitest run tests/monthly-price-plan-service.test.ts tests/monthly-price-plan-api.test.ts` — PASS: 21 tests en 2 archivos; incluye 401, 403, body inválido/campos extra, llave, replay, casing de UUIDs, fechas, cobertura duplicada y DTO.
- `pnpm test:zaltyko-operations:local` — PASS. Usa `createMonthlyPricePlan()` real para crear toda cobertura; prueba cobertura multiclass con una cuota por gimnasta, replay concurrente y equivalente entre mayúsculas/minúsculas, conflicto por cambio de cobertura, scope de sede/plantilla, rollback plan+cobertura+outbox+auditoría y carrera de alta concurrente con emisión con límite de 15 s. La prueba de invoice con `quoteHash` cambiado confirma `PERIOD_ALREADY_INVOICED` y que no cambian factura, líneas, cargos, outbox ni auditoría.
- `pnpm typecheck`, ESLint focal, Prettier focal, `bash -n scripts/run-zaltyko-operational-services-local.sh` y `git diff --check` — PASS.
- Gate de migraciones y RLS no se amplían en este bloque porque no se modificó esquema ni policy. La prueba usa Postgres efímero local; no prueba navegador, CI, sandbox ni producción.
- El harness conserva la prueba heredada (presente ya en `470bb151` y en el branch base `e2345ea5`) que rechaza un `quoteHash` de factura ya emitida con una llave nueva. Añade el caso de la misma llave con `quoteHash` cambiado: la ejecución local devuelve `PERIOD_ALREADY_INVOICED` y confirma que factura, líneas, cargos, outbox y auditoría no cambian. No se modificó el servicio de facturas.

## Siguiente dependencia

La cotización ya falla de forma segura cuando una tarifa no cubre todas las inscripciones de una gimnasta. La gestión posterior de vigencias y cambios de cobertura requiere un bloque separado; este cambio no crea ni presupone filas de cobertura reales fuera de los fixtures locales.

## Cierre de vault

No se actualiza el vault en este bloque: el encargo fijó ownership exclusivo de servicio, ruta, tests, harness y este QA note.
