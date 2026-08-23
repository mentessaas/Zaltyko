---
issue: ZAL-627
parent: ZAL-610
depends_on: ZAL-620, ZAL-626
verdict: IMPLEMENTED-LOCAL-SANDBOX
date: 2026-08-14
author: Engineering Lead
evidence_scope: local-repository-and-sandbox; synthetic-only; no production, real data, secrets, or human validation
---

# ZAL-627 — Implementación sandbox de importación asistida y exportación modular

## Resultado

Se implementó un contrato ejecutable y compartido para Web/Mobile en `src/lib/migration/sandbox.ts`, con un registry en memoria exclusivamente sandbox. No es una persistencia productiva ni ejecuta migraciones remotas.

El flujo queda separado en `preview_ready`/`mapping_required` → `validated` → `committing` → `committed` → `rolled_back`, con `failed` para bloqueos de commit y `rollback_failed` reservado para una futura inyección de fallo técnico. El preview no crea registros.

## Cobertura técnica

- Mapping derivado por cabecera, muestra de valores, confianza `exact`/`alias`/`manual`/`unmapped` y bloqueo de campos requeridos.
- Errores accionables por fila sin devolver valores sensibles en mensajes: `IMPORT_ROW_INVALID`, `AMBIGUOUS_DATE`, `AMBIGUOUS_MAPPING`, `DUPLICATE_SUSPECTED`, `IDEMPOTENCY_CONFLICT`, `IMPORT_TOTAL_MISMATCH` y `IMPORT_STRUCTURE_UNSUPPORTED`.
- `external_id` es la identidad prioritaria. Gemelas con IDs distintos permanecen separadas; un payload repetido no sobreescribe silenciosamente.
- El job exige la academia sintética `00000000-aaaa-0000-0000-000000000001`, tenant y rol permitido. El registry comprueba tenant + academia en cada lectura, resolución, commit, rollback y exportación.
- Finanzas valida EUR, fecha, importe decimal, tipo, estado de origen, referencia y vínculo familiar/atleta. El cargo sintético marcado como saldo de apertura se reconcilia aparte; no se infiere `paid` desde el histórico.
- Commit y rollback son operaciones explícitas e idempotentes en el sandbox; un segundo rollback devuelve `IDEMPOTENCY_CONFLICT`.
- Exportación acotada a `athletes`, `families`, `debts`, `payments`, `notes` y `audit`, cada una con CSV y manifest `sandbox-export-1.0`. Un módulo no disponible se entrega como `partial`; no existe “exportar todo”.
- Rutas compartidas: `POST /api/migrations/sandbox` para preview y `GET/POST /api/migrations/sandbox/[jobId]` para consulta, resolución, commit, rollback y exportación. Todas pasan por `withTenant`; solo owner/admin/super_admin opera el flujo.

## Verificación

- Suite focal: `tests/lib/sandbox-migration.test.ts`.
- Conteo literal: `grep -c "  it(" tests/lib/sandbox-migration.test.ts` → `12`.
- Ejecución literal: `pnpm exec vitest run tests/lib/sandbox-migration.test.ts --reporter=dot` → `Test Files 1 passed (1)` y `Tests 12 passed (12)`.
- El runner reporta `close timed out after 10000ms` por un proceso Vite abierto en el entorno compartido; no se presenta como fallo de los 12 casos, pero sí queda registrado como advertencia ambiental.
- TypeScript focal limpio con `pnpm exec tsc -p /private/tmp/zaltyko-sandbox-tsconfig.json`.
- `git diff --check` limpio.

## Discrepancias de fixtures conservadas de forma honesta

- `finances.csv` contiene un cargo adicional identificado por la nota `saldo apertura esperado`; la reconciliación excluye ese cargo del total operativo y lo registra como `openingBalance=135`, por lo que los totales contractuales son 285/150/0/135.
- La fila declarada por Data como “sin nombre” contiene el sentinel sintético `Sin Nombre` y una nota que indica obligatoriedad. El sandbox la rechaza como nombre ausente para evitar pérdida silenciosa; no es una regla aplicada a rutas productivas.
- `athletes-multisheet.xlsx` se rechaza porque P0 admite una hoja plana única, aunque el manifest de Data describe hojas auxiliares. No se amplió el alcance sin decisión de Product.

## Límites

La evidencia es L/T local y sintética. No acredita producción, portabilidad universal, compatibilidad con terceros, adopción, validación humana, reimportabilidad comercial ni cobertura mobile X. QA debe ejecutar su issue separada con controles negativos, matriz de dispositivos y revisión independiente.

Vault: añadidos este work product y la entrada correspondiente en `Changelog interno.md`. No se actualizó `Decisiones.md`, `Pricing.md` ni `Mensajes aprobados.md`: no cambia dirección de negocio, precio ni promesa pública.
