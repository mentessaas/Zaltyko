---
status: active
owner: producto
last_reviewed: 2026-07-13
source:
  - ../PRODUCT-ANALYSIS.md
  - ../ROADMAP.md
  - ../README.md
---
# Inventario de producto

## Resumen por modulo

| Modulo | Estado | Rutas principales | Gaps |
| --- | --- | --- | --- |
| Atletas | Avanzado | `/app/[academyId]/athletes` | Historial medico/documentos prometidos; revisar evaluaciones por atleta. |
| Coaches | Avanzado / Fase 3 desplegada | `/app/[academyId]/coach`, `/app/[academyId]/coach/today/[sessionId]` | Mantener métricas de uso y QA con entrenadores reales. |
| Clases | Avanzado | `/app/[academyId]/classes`, cockpit de sesión | Políticas/waitlist visibles y consistencia CRUD. |
| Grupos | Avanzado | `/app/[academyId]/groups` | Mantener UX y permisos. |
| Billing | Avanzado / RC Fase 1 | `/app/[academyId]/billing` | Trial Starter 7 días, Checkout/Portal owner-only, historial y webhook endurecido. Pendientes: promoción/QA producción, checkout anual, contabilidad y proyecciones. |
| Eventos | Avanzado | Publico y dashboard | Inscripcion publica completa, resultados, listados federativos. |
| Evaluaciones | Avanzado / Fase 3 desplegada | `/app/[academyId]/assessments`, atleta evaluate/progress/history, cockpit de sesión | Seguimiento independiente o ligado a sesión, modalidad, aparato y evaluador; ampliar rúbricas verticales. |
| Asistencia | Avanzado / Fase 3 desplegada | `/app/[academyId]/attendance`, `/api/attendance`, reportes y cockpit de sesión | Pase de lista y excepciones verificados con coach; mantener QA de export/reportes. |
| Comunicacion | Avanzado / Fase 2-3 desplegada | Mensajes, comms, notificaciones, anuncios y aviso contextual desde sesión | Falta QA humana parent/athlete con cuentas reales vinculadas. |
| IA | Parcial | API/widgets | Falta valor end-to-end en producto. |
| Marketplace/empleo | Parcial | `/marketplace`, `/empleo` | Revisar monetizacion y consistencia. |
| SEO/i18n | Parcial | `/(site)/[locale]/...` | Traducciones completas y contenido localizado. |

## Notas de implementacion

- Mantener etiquetas sport-aware. No normalizar `Gimnastas` a `Atletas` sin requisito explicito.
- Cada modulo nuevo debe documentar rutas, APIs, tablas, componentes y gaps.
- Las promesas externas del modulo deben existir en [[Mensajes aprobados]] antes de usarse en landing o ventas.

## Modulos con prioridad de cierre

1. Billing/pricing por impacto en confianza y revenue.
2. Evaluaciones porque es diferenciador vertical.
3. Comunicacion porque afecta retencion y experiencia de familias.
4. Onboarding porque activa trials y reduce churn temprano.

## Rutas relevantes detectadas

- Academia: `/app/[academyId]/dashboard`, athletes, classes, groups, coaches, events, billing, attendance, assessments, evaluations, messages, notifications, whatsapp, reports.
- Publicas: `/academias`, `/events`, `/marketplace`, `/empleo`, `/pricing`, clusters SEO por locale/modalidad/pais.
- Legacy dashboard: existen rutas bajo `/dashboard/*`; revisar si siguen vivas o son compatibilidad.

Ver detalle de conteo y riesgos en [[Auditoria de producto real]].

## Auditoria de rediseño integral

- La auditoria UX/UI, mapa de roles, arquitectura de navegacion, direccion de producto, Design System 2.0 propuesto, migracion y criterios de aceptacion estan en [[Auditoria UX UI integral - 2026-07-15]].
- Estado: propuesta previa a implementacion. No autoriza todavia cambios visuales ni retirada de rutas.

## Cierre del mapa de objeciones del director

- La matriz ejecutable y sus criterios de evidencia están en [[../../docs/plans/2026-07-23-objection-closure-matrix]].
- El cierre puede incluir rediseño, simplificación, ampliación o sustitución de módulos cuando mejore claridad, adopción, accesibilidad, rendimiento, conversión o eficiencia operativa.
- Se mantienen como invariantes la seguridad multi-tenant, los permisos, la integridad de pagos, los límites comerciales y la disciplina de migraciones/versionado.
- Exportación: atletas, transacciones, asistencia, finanzas, progreso y evaluaciones tienen salidas específicas; eventos/competiciones aún responde `501 NOT_IMPLEMENTED` y no debe venderse como listado federativo automático.
