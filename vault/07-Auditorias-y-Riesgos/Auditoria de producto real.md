---
status: active
owner: producto
last_reviewed: 2026-07-06
source:
  - ../src/app
  - ../src/db/schema
  - Inventario de producto
---
# Auditoria de producto real

## Resumen

El producto real tiene una superficie amplia y mas avanzada que varios documentos legacy. La vault debe tratar `src/app` y `src/db/schema` como evidencia primaria para estados de producto.

## Conteo aproximado por modulo

| Modulo | Rutas/puntos detectados | Lectura |
| --- | ---: | --- |
| Atletas | 29 | Muy avanzado; incluye documentos, tutores, historial, progreso y acceso super-admin. |
| Clases | 26 | Muy avanzado; sesiones, excepciones, recurrencia, enrollments y waitlist. |
| Grupos | 9 | Avanzado; CRUD, resumen y asignacion de atletas. |
| Coaches | 19 | Avanzado; perfiles, asignaciones, compensacion, notas y public settings. |
| Billing | 44 | Muy avanzado; mayor riesgo por Stripe, pricing y plan lifecycle. |
| Eventos | 29 | Avanzado; publico, dashboard, invitaciones, pagos, waitlist y resultados. |
| Evaluaciones/progreso | 16 | Parcial/avanzado; necesita QA end-to-end. |
| Asistencia | 9 | Parcial/avanzado; vista, API, reportes y AI risk. |
| Comunicacion | 47 | Amplio pero disperso; necesita consolidacion UX y copy preciso. |
| Reportes | 22 | Amplio; validar exports y permisos. |
| Public/growth | 37 | Directorio, marketplace, empleo, pricing y eventos publicos. |
| Onboarding | 15 | Base activa; falta validar aha moments y trial lifecycle. |

## Hallazgos

- Existen rutas nuevas bajo `/app/[academyId]` y rutas legacy bajo `/dashboard`; se debe decidir si `/dashboard` sigue siendo compatibilidad o deuda.
- Comunicacion no es una sola pantalla: hay mensajes de contacto, notificaciones, WhatsApp, announcements, templates, scheduled notifications y direct messages.
- WhatsApp esta protegido por feature flag; marketing no debe venderlo como disponible para primeros clientes si el flag esta apagado.
- Evaluaciones tiene hub y rutas por atleta, pero el historial en una ruta transforma assessments con `skills: []`; validar si el detalle completo aparece en componente/API.
- Billing es el area con mayor superficie y mayor riesgo operativo.

## Acciones

- Mantener [[Inventario de producto]] como resumen ejecutivo y esta nota como auditoria de evidencia.
- Crear tareas por modulo solo cuando haya flujo QA o bug concreto.
- Antes de eliminar rutas legacy, registrar decision en [[Decisiones]].

## Auditoria super-admin 2026-07-06

Alcance: revision como QA senior / PM / super-admin sobre la superficie de administracion global. La validacion UI queda bloqueada porque `pnpm dev` y `pnpm build` fallan por dependencias/tooling; la auditoria se basa en evidencia estatica de codigo y comandos locales.

Hallazgos principales:

- P0: toolchain local no renderiza producto. `pnpm dev` falla por Sentry, `pnpm build` por `date-fns-tz`/`axios`, y `pnpm lint` por ESLint/dependencias. Sin esto no se puede auditar ni vender con confianza.
- P0/P1: `/super-admin/users/[profileId]` hace self-fetch desde Server Component a una API protegida sin reenviar cookies y ademas no desempaqueta respuestas estandar `{ ok, data }`; riesgo de detalle de usuario roto.
- P1 seguridad/producto: existe `DELETE` hard-delete de academias en API super-admin. Debe sustituirse por suspender/archivar con auditoria y confirmacion fuerte.
- P1 seguridad: el endpoint de usuarios permite cambios de rol con validacion defensiva insuficiente y sin confirmacion backend especifica para promocionar a `super_admin`.
- P1 UX/producto: super-admin carece de KPIs operativos clave para gestionar academias reales: pagos pendientes, morosidad, actividad real, grupos creados, salud por academia y alertas.
- P2 producto: ocultar enlaces de billing/settings/support en navegacion no elimina la deuda de rutas directas; las pantallas deben cerrarse con feature flag/404 o completarse.

Accion recomendada: resolver primero toolchain, despues blindar permisos/destructividad super-admin, y finalmente ejecutar QA manual con credenciales reales de super-admin en una academia `TEST ZALTYKO`.

## Correcciones super-admin 2026-07-06

Estado: P0/P1 tecnico cerrado para la superficie auditada, sin tocar datos reales.

- Toolchain local restaurada: `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm test -- --run` pasan. `pnpm dev` permite compilar y consultar `/super-admin/dashboard`, `/super-admin/users` y `/super-admin/users/[profileId]`; sin cookies, las tres rutas redirigen a `/auth/login` en vez de romper con 500.
- Detalle de usuario super-admin deja de hacer self-fetch HTTP sin cookies desde Server Component; usa servicio server-side compartido y la UI desempaqueta respuestas estandar `{ ok, data }` tras mutaciones.
- El endpoint super-admin de academias ya no ejecuta hard-delete. `DELETE /api/super-admin/academies/[academyId]` devuelve 405 `ACADEMY_DELETE_DISABLED` y registra `academy.delete_blocked`; la tabla de academias solo expone cambio de estado.
- PATCH de usuario valida roles con enum Zod, exige confirmacion backend para promocionar a `super_admin` y registra `user.role_changed` con rol anterior/nuevo.
- `/super-admin/billing`, `/super-admin/settings`, `/super-admin/support` y detalle de ticket quedan cerradas por `SUPER_ADMIN_EXPERIMENTAL_MODULES !== "true"` hasta estar listas.
- Tests anadidos/cubiertos: bloqueo de delete de academias, promocion a `super_admin` con confirmacion obligatoria, audit log de cambio de rol y hardening existente de APIs. Evidencia local: suite Vitest completa `349/349` PASS.

Riesgos pendientes: warnings no bloqueantes de build por carga ESM de `tailwind.config.ts` y dynamic require de `swagger-jsdoc`; revisar en deuda DX si se quiere build sin warnings. Queda fuera de esta correccion el enriquecimiento de KPIs operativos super-admin.
