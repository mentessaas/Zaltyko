---
status: active
owner: producto
last_reviewed: 2026-06-22
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
- Auditoria 2026-07-07: super admin tenia metricas y comparativas inventadas presentadas como reales; se corrigio a datos reales o estados vacios.
- Auditoria 2026-07-07: el copy de cobros/billing/settings podia sugerir fiscalidad oficial; se ajusto a cobros, cuotas, recibos internos y suscripcion SaaS.
- Auditoria 2026-07-07: e2e autenticado queda bloqueado hasta regenerar `.auth/user.json`; sin esto no hay evidencia automatizada de demo autenticada.
- Auditoria 2026-07-07 segunda tanda: el bloqueo de e2e no es Playwright sino credenciales demo invalidas en Supabase Auth.
- Auditoria 2026-07-07 segunda tanda: asistencia/progreso de coach tienen guard API por clase/atleta asignado; falta e2e real con usuario coach.
- Auditoria 2026-07-07 segunda tanda: `/api/family/children` ya filtra por tenant y relaciones familiares; quedan endpoints relacionados por revisar.
- Auditoria 2026-07-07 segunda tanda: dev-session ya genera dataset demo coherente para Espana y rutas owner clave renderizan 200 sin marcadores de error.

## Acciones

- Mantener [[Inventario de producto]] como resumen ejecutivo y esta nota como auditoria de evidencia.
- Crear tareas por modulo solo cuando haya flujo QA o bug concreto.
- Antes de eliminar rutas legacy, registrar decision en [[Decisiones]].
- Antes de demo comercial, ejecutar `docs/QA_CHECKLIST.md` y `docs/DEMO_READY_CHECKLIST.md`.
- Antes de demo comercial autenticada, actualizar credenciales demo y generar storage states separados para super_admin, owner y coach.
