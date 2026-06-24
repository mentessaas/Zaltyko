---
status: active
owner: producto
last_reviewed: 2026-06-24
source:
  - ../PRODUCT-ANALYSIS.md
  - ../BUSINESS-ANALYSIS.md
  - ../ROADMAP.md
  - ../docs/GO_LIVE_REVIEW_2026-04.md
  - ../AGENTS.md
---
# Estado actual de Zaltyko

## Lectura rápida

Zaltyko está en fase de hardening. El core operativo existe, pero hay gaps entre lo que el producto promete, lo que el código soporta y lo que está listo para vender con confianza.

## Enfoque estrategico activo

El go-to-market inicial se enfocara en academias de gimnasia artistica y ritmica en espanol. La arquitectura sigue preparada para otras disciplinas, pero discovery, beta, pricing y MVP comercial deben priorizar gimnastas, familias, clases, cuotas, asistencia, progreso tecnico y comunicacion interna.

Ver: [[Guia de trabajo para agentes]], [[Estrategia competitiva gimnasia]], [[Matriz competitiva gimnasia]], [[MVP exacto Zaltyko gimnasia]].

## Decisiones activas que no deben reabrirse por defecto

- Pricing v3.0 ya esta publicado como modelo oficial: Free 30, Starter 19 €/mes hasta 75, Growth 49 €/mes hasta 200 y Network 99 €/mes multi-sede acompanado.
- Las entrevistas de pricing son validacion post-lanzamiento de conversion, no bloqueo para publicar v3.0.
- Familias y atletas usan portal limitado moderno; no deben recibir rutas administrativas ni depender de `/dashboard/*` legacy.
- La comunicacion v1 prioriza mensajes, avisos, notificaciones e historial dentro de Zaltyko. WhatsApp queda secundario/futuro.

## Lo que tenemos

| Área | Estado | Nota |
| --- | --- | --- |
| Multi-tenant auth | Activo | `withTenant` es obligatorio en APIs. |
| Atletas | Avanzado | Perfiles, tutores, historial, import/export y vistas principales. |
| Clases y grupos | Avanzado | Calendario, sesiones, grupos, asistencia y capacidad. |
| Billing | Avanzado | Cargos, descuentos, becas, recibos, Stripe y reportes parciales. |
| Eventos | Avanzado | CRUD, inscripciones, waitlist, archivos y páginas públicas. |
| Evaluaciones | Parcial/avanzado | Hay rutas de evaluaciones, evaluate, historial y progreso por atleta; falta validar flujo end-to-end. |
| Asistencia | Parcial/avanzado | Existe pagina dedicada `/app/[academyId]/attendance`, API y reportes; falta QA end-to-end. |
| Comunicación | Parcial/avanzado | Hay mensajes, notificaciones, WhatsApp, templates e historial; la prioridad v1 es comunicacion interna dentro de Zaltyko y WhatsApp queda secundario/futuro. |
| IA | Parcial | Endpoints e ideas de widgets; falta integración de valor visible. |
| SEO/geografía | Parcial | Clusters y rutas avanzadas; faltan traducciones/contenido completo. |
| Marketplace/empleo | Parcial/avanzado | Rutas públicas y APIs existen; revisar consistencia comercial. |

## Lo que falta o está en riesgo

- Verificar Stripe price IDs reales por entorno para Starter/Growth y mantener Network como CTA comercial hasta tener checkout dedicado.
- Validar flujos visibles de evaluaciones, asistencia y comunicación unificada contra QA real.
- Reducir deuda UX en pantallas críticas del dashboard.
- Completar estrategia de activación, trial, onboarding y conversión.
- Revisar todas las promesas públicas antes de usarlas en marketing o ventas.
- Mantener migraciones Supabase con revisión manual antes de operaciones destructivas.

## Prioridades actuales

1. P0: validar checkout real de Starter/Growth con Stripe price IDs productivos y webhooks.
2. P0: corregir riesgo de downgrade/cancelacion Stripe y validar item de suscripcion.
3. P0: asegurar que APIs nuevas mantengan `withTenant`, RLS y respuestas estándar.
4. P1: validar evaluaciones, asistencia y comunicación como flujos completos de usuario.
5. P1: cerrar onboarding y demo para prueba gratuita.
6. P2: profundizar SEO, marketing, ventas y customer success con mensajes aprobados.

## Dónde mirar

- Producto: [[Inventario de producto]]
- Tecnología: [[Arquitectura]]
- Negocio: [[Modelo de negocio]] y [[Pricing]]
- Marketing: [[Mensajes aprobados]]
- Roadmap: [[Roadmap maestro]] y [[Backlog priorizado]]
- Riesgos: [[Registro de riesgos]]
