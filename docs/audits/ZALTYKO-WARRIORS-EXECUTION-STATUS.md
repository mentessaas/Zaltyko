# Zaltyko × Warriors × Upgrade — estado de ejecución

Fecha de corte: 15 de septiembre de 2026

Este documento separa evidencia actual de inferencias. No es una declaración de
Go/No-Go de producción.

## Hechos verificados en el checkout

- El checkout canónico es Next.js + TypeScript + Supabase/PostgreSQL + Drizzle.
- Existen entidades para leads, trials, atletas, grupos, sesiones, asistencia,
  tutores, cobros, notificaciones, evaluaciones y catálogo de skills.
- `athlete_skills` y el endpoint tenant-scoped de observaciones ya existen como
  migración aditiva; conservan estado, fecha, observador, evidencia y visibilidad
  para tutores.
- El mapper de Upgrade produce un dry-run reproducible sin escrituras
  productivas: 1.403 skills normalizadas, 561 filas con vídeo, 15 identidades
  duplicadas y 889 registros que requieren revisión. `gymnasts`, `routines` y
  `meets` no se importan como entidades de Zaltyko.
- El catálogo conserva `source`, `source_id`, `source_version`, `content_hash` y
  `quality_status`.
- Se añadió `lead_trials` para distinguir la clase de prueba de un prospecto de
  la prueba de suscripción de la academia, y `lead_trial_outcomes` como historial
  append-only de resultados con tenant, academia, lead trial, notas, siguiente
  acción, observador, metadata e idempotency key. Tiene índices y RLS.
- La ruta `POST/GET /api/lead-trials/[trialId]/outcome` valida payload, comprueba
  el trial y la academia dentro del tenant, exige `billing:update` para escribir,
  es idempotente, actualiza el estado de asistencia cuando corresponde y emite
  `lead_trial_outcome_recorded`. La creación de trials también es idempotente y
  emite `lead_trial_created`.
- El despliegue productivo más reciente está `READY` en Vercel como
  `dpl_8GCyEWdJ3n96gsCcWE66dt32xyrW`, con alias `zaltyko.com`. El endpoint nuevo
  responde `401 UNAUTHENTICATED` sin sesión y la ruta legacy eliminada responde
  `404`, evidencia de protección de borde, no de E2E autenticado.
- Los contratos de trial outcome, catálogo, lead-link y branding pasan; también
  pasan TypeScript, lint de aplicación y `git diff --check` en el checkout actual.

## Contradicciones o límites actuales

- `academy_trials.lead_id` y las migraciones nuevas son aditivas y todavía no se
  deben tratar como aplicadas en la base remota. El servicio de trial mantiene
  una lectura compatible para que la versión estable no dependa de esa columna.
- La tabla legacy `leads` todavía no contiene `tenant_id` ni `academy_id`; por eso
  el vínculo opcional de `lead_trials` solo valida existencia del lead. La
  propiedad por academia queda como deuda explícita de modelo, no como permiso
  implícito.
- El preflight `supabase db push --linked --dry-run` se ejecutó el 15/09/2026 y
  fue detenido por divergencia del historial: Supabase reporta migraciones
  remotas que no existen localmente y recomienda reparar versiones remotas antes
  de cualquier push. No se ejecutó ninguna escritura.
- Una consulta de solo lectura al esquema remoto confirmó que `leads` aún no
  tiene `tenant_id`/`academy_id` y que `lead_trials`/`lead_trial_outcomes` aún
  no existen allí; la última versión del ledger remoto observada es
  `20260911031638`.
- Se preparó la migración aditiva `20260915150000_lead_ownership.sql`: añade
  `tenant_id`/`academy_id` nullable e índice a `leads`, sin borrar ni reescribir
  datos existentes. Los leads sin propietario se reclaman solo al crear un trial
  autorizado; los que pertenecen a otra academia se rechazan.
- El endpoint de creación tiene compatibilidad explícita mientras esa migración
  no exista en remoto: usa la comprobación legacy acotada y activa ownership
  automáticamente al detectarlo, evitando una regresión `500` durante el rollout.
- Existe una bandeja autenticada `/app/{academyId}/trials` para owner/admin que
  agenda pruebas, lista próximos trials, captura notas y registra asistencia o
  seguimiento. La conversión posterior a atleta/enrollment aún requiere pasos
  manuales.
- La subida de logo está implementada en la ruta canónica de Branding y ya está
  visible en producción en el despliegue `dpl_8GCyEWdJ3n96gsCcWE66dt32xyrW`.
  La selección de un archivo real aún no se ha ejecutado en E2E.
- Una prueba E2E autenticada de seleccionar un archivo real, cobrar una cuota y
  ejecutar todo el circuito en una academia sintética sigue `NO VERIFICADO`.
- Los avisos de Supabase (protección de contraseñas filtradas, initplan RLS,
  políticas permisivas e índices duplicados) están documentados; no se cambió
  configuración remota sin una ventana y plan de rollback.

## Siguiente orden de implementación

1. Aplicar y verificar las migraciones aditivas en una base de staging; después
   ejecutar el flujo trial outcome con datos sintéticos.
2. Añadir CTA de conversión desde la bandeja de trial, reutilizando atletas,
   grupos y clases existentes.
3. Conectar la observación rápida de skill al contexto de sesión y publicar un
   resumen parental con consentimiento.
4. Ejecutar un E2E autenticado completo (lead → trial → outcome → enrollment →
   sesión → asistencia → skill → evaluación → notificación → cobro).
5. Promover a producción únicamente un despliegue `READY` y repetir smoke de
   chat, branding, auth, storage y billing.

## Recomendación de producto

Mantener el núcleo operativo y no abrir ahora federaciones, rankings, marketplace
ni una app nativa. El criterio de éxito es que owner, coach y tutor completen el
circuito con menos trabajo duplicado y con historial reproducible; no que exista
una lista extensa de módulos.
