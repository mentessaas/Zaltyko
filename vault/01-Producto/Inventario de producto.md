---
status: active
owner: producto
last_reviewed: 2026-06-22
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
| Coaches | Avanzado | Dashboard academia | Horarios disponibles y sincronizacion completa. |
| Clases | Avanzado | `/app/[academyId]/classes` | Politicas/trials/waitlist visibles y consistencia CRUD. |
| Grupos | Avanzado | `/app/[academyId]/groups` | Mantener UX y permisos. |
| Billing | Avanzado | `/app/[academyId]/billing` | Pricing, limites, checkout anual, contabilidad, proyecciones. |
| Eventos | Avanzado | Publico y dashboard | Inscripcion publica completa, resultados, listados federativos. |
| Evaluaciones | Parcial/avanzado | `/app/[academyId]/assessments`, `/app/[academyId]/evaluations`, atleta evaluate/progress/history/assessments | Validar flujo crear -> puntuar -> historial -> export. |
| Asistencia | Parcial/avanzado | `/app/[academyId]/attendance`, `/api/attendance`, reportes attendance | Validar registro, reportes, export y permisos. |
| Comunicacion | Parcial/avanzado | `/app/[academyId]/messages`, `/app/[academyId]/notifications`, `/app/[academyId]/whatsapp` | Unificar experiencia y validar segmentacion/lectura. |
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
