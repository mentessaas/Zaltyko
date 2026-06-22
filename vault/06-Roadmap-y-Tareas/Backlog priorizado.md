---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../INCONSISTENCY-AUDIT.md
  - ../docs/migrations-backlog.md
---
# Backlog priorizado

## P0

| Estado | Tarea | Dueño | Criterio de aceptacion | Pruebas/Evidencia |
| --- | --- | --- | --- | --- |
| Resuelto | Corregir downgrade Stripe. | tech | `/api/billing/downgrade` obtiene el subscription item real desde Stripe antes de actualizar price. | [[Tarea - Corregir downgrade Stripe]]. |
| Documentado | Validar checkout mensual y bloquear anual comprable hasta existir price anual. | tech/negocio | La UI no permite comprar anual si solo hay `stripePriceId` mensual; copy dice "proximamente" o se implementan price IDs anuales. | [[Tarea - Validar checkout y planes]]. |
| Documentado | Confirmar planes reales Starter/Growth/Network contra DB y Stripe. | negocio/tech | `plans` contiene `free/pro/premium` con nicknames y limites de `PRODUCT_PLANS`; no hay placeholders en prod. | [[Tarea - Validar checkout y planes]]. |
| Activo | Mantener auth tenant y respuestas estandar en APIs nuevas. | tech | APIs tenant usan `withTenant` y helpers `apiSuccess/apiCreated/apiError`. | `pnpm lint`, `pnpm audit:api-routes:strict` si aplica. |
| Activo | Revisar promesas publicas contra features reales. | producto/marketing | Landing/pricing/modulos no prometen features parciales como completas. | Comparar con [[Mensajes aprobados]] e [[Inventario de producto]]. |

## P1

| Estado | Tarea | Dueño | Criterio de aceptacion | Pruebas/Evidencia |
| --- | --- | --- | --- | --- |
| QA pendiente | Validar flujo de evaluaciones end-to-end. | producto/tech | Un usuario puede crear/evaluar/ver historial/progreso/exportar sin salir del tenant. | [[Tarea - Validar evaluaciones end-to-end]], [[QA - Flujos P1]]. |
| Parcial | Consolidar experiencia de comunicacion. | producto/tech | Mensajes, notificaciones y WhatsApp tienen navegacion clara y estados leidos/historial comprensibles. | [[Tarea - Consolidar comunicacion]]. |
| QA pendiente | Completar onboarding/trial con aha moments. | producto/growth | Owner llega a primer atleta, clase y cobro/demo en una sesion. | [[Tarea - Completar onboarding y aha moments]], [[QA - Flujos P1]]. |
| QA pendiente | Validar asistencia y reportes dedicados. | producto/tech | Registro de asistencia alimenta reportes/export sin romper permisos. | [[Tarea - Validar asistencia y reportes]], [[QA - Flujos P1]]. |

## P2

| Tarea | Dueño | Evidencia |
| --- | --- | --- |
| Profundizar SEO localizado e i18n. | marketing/tech | [[SEO y geo]]. |
| Definir add-ons monetizables. | negocio/producto | [[Modelo de negocio]]. |
| Crear playbooks de CS por plan. | ventas | [[Customer success]]. |
