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
6. Los helpers `SECURITY DEFINER` del dominio nuevo viven en
   `zaltyko_domain_private`; `zaltyko_private` conserva la frontera heredada
   hasta un cutover explícito.

## Bounded contexts

| Contexto      | Autoridad                                                                        | Publica                           |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| Organizations | organización, sedes, miembros, scopes, especialidades                            | membership/location/sport changed |
| Sport Config  | perfiles versionados por país/federación, fuente y configuración                 | profile published/retired         |
| People        | persona, atleta, staff y relaciones familiares                                   | athlete/staff changed sin PII     |
| Scheduling    | programas deportivos o complementarios, grupos, plantillas, sesiones y staff     | session lifecycle                 |
| Enrollments   | altas, pausas, bajas y transferencias                                            | enrollment lifecycle              |
| Growth Ops    | trials, followups, waitlist y ofertas                                            | trial/waitlist lifecycle          |
| Attendance    | asistencia por sesión e inscripción                                              | attendance recorded               |
| Billing       | tarifas de academia, modalidad, invoice, cargos, pagos, autorizaciones y refunds | financial lifecycle               |
| SaaS Billing  | suscripción comercial y capacidades server-owned de Zaltyko                      | entitlement changed               |
| Analytics     | definiciones, runs, valores, calidad y proyecciones agregadas reconstruibles     | metrics/cohorts materialized      |
| Health Score  | versiones, pesos y snapshots explicables                                         | score materialized                |
| Insights      | reglas, deduplicación, acciones y outcomes                                       | insight lifecycle                 |
| Experiencia   | preferencias de módulos por usuario y academia                                   | orden de presentación             |

## Invariantes ya codificadas

- todas las tablas de negocio incluyen `organization_id`;
- las dependientes de sede incluyen `location_id`;
- las FKs compuestas rechazan referencias entre organizaciones;
- un atleta puede pertenecer simultáneamente a varios grupos;
- no puede tener dos memberships abiertas en el mismo grupo;
- `group_membership_history` es el historial tipado append-only de cada
  alta, pausa, reactivación y baja; grupo y sede se autorizan en servidor y
  RLS por alcance físico;
- no puede tener dos inscripciones abiertas en la misma plantilla;
- una sesión tiene fin posterior a inicio y capacidad positiva;
- historial de inscripción y outbox usan claves idempotentes;
- tutor, contacto, permiso familiar y pagador son relaciones separadas;
- al asociar atletas a una familia, la validación de sede cuenta IDs distintos
  con al menos una inscripción `pending`/`active` en la organización y sede;
  el join M:N usa `DISTINCT` y limita por el número de IDs únicos solicitados;
  el conjunto resultante debe cubrir la solicitud completa;
- `price_plans` son precios de clases de la academia; nunca representan la
  suscripción SaaS. `organization_saas_subscriptions` es la proyección del
  proveedor, `organization_entitlements` el plan efectivo y
  `organization_entitlement_changes` su historial append-only. Toda academia
  nueva recibe Free; ausencia de entitlement en una academia previa deniega
  capacidades pagadas;
- `family_collection_preferences` guarda una solicitud explícita por familia;
  ausencia equivale a manual. Free/trial y entitlements no vigentes no permiten
  solicitar automático. Cada cambio de entitlement incrementa revisión, por lo
  que una preferencia automática previa necesita confirmación tras downgrade;
- al emitir un cargo, `collection_mode` conserva un snapshot de la preferencia
  familiar solo si su entitlement sigue vigente y la revisión coincide. Los
  cargos emitidos no cambian; el snapshot no inicia pagos y el modo efectivo
  sigue manual hasta completar los gates de release;
- las referencias de mandato y consentimiento se guardan por pagador con
  alcance tenant-aware, digest/versionado y revocación; no se conserva tarjeta,
  cuenta bancaria ni PII en bruto;
- una preferencia `automatic` no es un permiso para cobrar: la ejecución exige
  plan activo pagado, procesador listo, consentimiento vigente y runtime
  liberado. El runtime permanece deshabilitado hasta completar los gates del
  ADR-0020;
- perfiles deportivos se versionan por país/federación; identidad sin reglas no
  se presenta como configuración federativa verificada;
- `organization_sports` conserva la relación M:N y el rol principal/adicional;
- los programas separan gimnasia de actividades complementarias;
- trial y oferta reservan capacidad mediante enrollments canónicos;
- cohortes del dashboard se leen de una proyección sin identificadores de
  personas; solo el worker la reconstruye desde inscripciones e historial;
- el orden de módulos se guarda por persona/academia y no altera autorización,
  filtros, consultas ni cálculos;
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
