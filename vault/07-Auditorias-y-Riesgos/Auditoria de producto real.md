---
status: active
owner: producto
last_reviewed: 2026-07-09
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
- Auditoria 2026-07-08: scroll publico corregido (`html/body` pasan a `min-height`), Growth vuelve a 1 academia y Network queda como multi-sede acompanado. Segunda pasada autenticada recuperada: usuarios Auth E2E owner/coach/super-admin creados o actualizados, email confirmado, sesiones `.auth/user.json`, `.auth/coach.json` y `.auth/super-admin.json` regeneradas. Smoke por roles PASS 3/3 en Chromium; E2E principal PASS con 1 flaky que paso en retry; public smoke PASS 6/6. A11y autenticada sigue fallando por axe (progressbar sin nombre, contrastes y selects sin nombre accesible).
- Auditoria 2026-07-09: a11y autenticada corregida y estabilizada; `tests/a11y-zaltyko.spec.ts --project=chromium --workers=1` pasa 4/4. `tests/e2e-zaltyko-full.spec.ts --project=chromium --workers=1` pasa 20/20 tras separar rutas criticas por pagina. El agregado directo full+public+a11y pasa 30/30 en Chromium con un worker. `tests/e2e-role-smoke.spec.ts --project=chromium --workers=1` confirma owner, coach y super-admin PASS 10/10 con storage states `.auth/user.json`, `.auth/coach.json` y `.auth/super-admin.json`.
- Auditoria Super Admin 2026-07-09: dashboard, usuarios, academias, academias publicas, logs y APIs core funcionan; Owner/Coach no acceden al panel global. CRUD temporal funciona y se limpio. Riesgos detectados: "Ver como usuario" mezcla perfil objetivo con email del Super Admin; borrar academia creada con dueño deja owner residual; cambio de rol inline es demasiado facil; `logAdminAction` falla al insertar acciones sensibles en `audit_logs`; billing/settings globales son placeholders; soporte global redirige a `/dashboard`; copy tecnico/ingles sigue visible. Evidencia en `output/super-admin-audit/RESUMEN.md`.
- Correccion Super Admin 2026-07-09: "Ver como usuario" queda reformulado como perfil operativo y muestra email del usuario objetivo; cambios de rol inline requieren confirmacion; crear usuario/academia oculta contrasenas temporales por defecto; borrar academia conserva owner por decision explicita; audit logs quedan preparados con payload legible y migracion para logs globales. Validacion: typecheck PASS, audit-hardening PASS 12/12, role smoke PASS 10/10, Playwright autenticado con capturas en `/tmp/zaltyko-*.png`. Riesgos residuales: aplicar migracion `20260709000000_allow_global_audit_logs.sql`, resolver 500 de `/api/profile/preferences`, CSP local de Vercel Analytics y warnings de ratio de logo.
- Revalidacion 2026-07-10: las migraciones de auditoria global y aislamiento por tenant ya estan aplicadas; preferencias se alinearon con la base real. Tras build limpio y regeneracion de las tres sesiones, la auditoria conjunta en servidor de produccion pasa 40/40 en Chromium e incluye owner, coach y super-admin, accesibilidad, producto autenticado y páginas públicas. Se corrigieron además la hidratacion del login E2E, los detalles demo de marketplace/empleo y la navegación al detalle de atleta. No se observaron pruebas saltadas ni artefactos de fallo. Persisten dos avisos no bloqueantes: métricas GR no disponibles y formateo de `Sin días asignados` como fecha.

## Acciones

- Mantener [[Inventario de producto]] como resumen ejecutivo y esta nota como auditoria de evidencia.
- Crear tareas por modulo solo cuando haya flujo QA o bug concreto.
- Antes de eliminar rutas legacy, registrar decision en [[Decisiones]].
- Antes de demo comercial, ejecutar `docs/QA_CHECKLIST.md` y `docs/DEMO_READY_CHECKLIST.md`.
- Antes de demo comercial autenticada, ejecutar la auditoria local con Playwright directo y un worker (`pnpm exec playwright test ... --project=chromium --workers=1`) y reiniciar `next dev` entre pasadas largas si aparece el reinicio por umbral de memoria.
