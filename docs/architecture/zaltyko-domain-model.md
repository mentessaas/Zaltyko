# Modelo de dominio canónico — Zaltyko

## Hallazgos clave

1. Organización y sede son fronteras distintas: `organization_id` aísla el
   cliente y `location_id` limita el alcance operativo.
2. Grupo, plantilla recurrente, sesión real e inscripción no son equivalentes.
3. `group_memberships` conserva la relación M:N; `enrollments` aporta fechas,
   estado, origen y precio.
4. Las métricas son read models reconstruibles; nunca deben convertirse en la
   autoridad de operaciones o facturación.
5. RLS reduce el daño de errores, pero no sustituye autorización de servidor ni
   claves foráneas que impiden cruces de organización.

## Bounded contexts

| Contexto      | Autoridad                                       | Publica                       |
| ------------- | ----------------------------------------------- | ----------------------------- |
| Organizations | organización, sedes, miembros, scopes           | membership/location changed   |
| People        | persona, atleta, staff y relaciones familiares  | athlete/staff changed sin PII |
| Scheduling    | programas, grupos, plantillas, sesiones y staff | session lifecycle             |
| Enrollments   | altas, pausas, bajas y transferencias           | enrollment lifecycle          |
| Growth Ops    | trials, followups, waitlist y ofertas           | trial/waitlist lifecycle      |
| Attendance    | asistencia por sesión e inscripción             | attendance recorded           |
| Billing       | precios, invoices, charges, payments y refunds  | financial lifecycle           |
| Analytics     | definiciones, runs, valores y calidad           | metrics materialized          |
| Health Score  | versiones, pesos y snapshots explicables        | score materialized            |
| Insights      | reglas, deduplicación, acciones y outcomes      | insight lifecycle             |

## Invariantes ya codificadas

- todas las tablas de negocio incluyen `organization_id`;
- las dependientes de sede incluyen `location_id`;
- las FKs compuestas rechazan referencias entre organizaciones;
- un atleta puede pertenecer simultáneamente a varios grupos;
- no puede tener dos memberships abiertas en el mismo grupo;
- no puede tener dos inscripciones abiertas en la misma plantilla;
- una sesión tiene fin posterior a inicio y capacidad positiva;
- historial de inscripción y outbox usan claves idempotentes;
- tutor, contacto, permiso familiar y pagador son relaciones separadas;
- trial y oferta reservan capacidad mediante enrollments canónicos;
- audit log no admite UPDATE ni DELETE;
- tablas con PII, enrollment, asistencia, outbox y auditoría carecen de grants
  Data API para `authenticated` en esta fase.

## Lo que aún no demuestra este esquema

- capacidad segura bajo concurrencia;
- transición e historial guardados en una única transacción;
- ledger reconciliable;
- métricas o Health Score correctos;
- rutas, UI, E2E autenticado o despliegue.

Esos puntos son gates de las siguientes entregas y no deben declararse
resueltos por la existencia de tablas o contract tests.

## Fuente

- PRD técnico Owner Dashboard y Academy Health Score, 2026-10-06.
- ADR-0001 a ADR-0005 de esta carpeta.
