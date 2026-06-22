---
status: active
owner: producto
last_reviewed: 2026-06-22
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
| Comunicación | Parcial/avanzado | Hay mensajes, notificaciones, WhatsApp, templates e historial; falta confirmar centro unificado como experiencia final. |
| IA | Parcial | Endpoints e ideas de widgets; falta integración de valor visible. |
| SEO/geografía | Parcial | Clusters y rutas avanzadas; faltan traducciones/contenido completo. |
| Marketplace/empleo | Parcial/avanzado | Rutas públicas y APIs existen; revisar consistencia comercial. |

## Lo que falta o está en riesgo

- Alinear pricing real, límites internos y promesas de landing.
- Validar flujos visibles de evaluaciones, asistencia y comunicación unificada contra QA real.
- Reducir deuda UX en pantallas críticas del dashboard.
- Completar estrategia de activación, trial, onboarding y conversión.
- Revisar todas las promesas públicas antes de usarlas en marketing o ventas.
- Mantener migraciones Supabase con revisión manual antes de operaciones destructivas.

## Prioridades actuales

1. P0: corregir inconsistencias de monetización, límites de plan y checkout.
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
