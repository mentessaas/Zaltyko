# Matriz de cierre de objeciones del director de academia

Estado: en ejecución  
Owner: producto  
Fecha: 2026-07-23

Este documento convierte el mapa comercial en contratos de producto, comunicación,
operación y evidencia. Una fila solo pasa a `cerrada` cuando la capacidad existe,
se puede demostrar, está explicada de forma honesta y tiene una prueba adecuada.

## Estados

- `cerrada`: funcionalidad, copy, demo y evidencia alineados.
- `parcial`: existe una parte, pero falta validación, alcance o documentación.
- `acompañada`: existe, pero requiere onboarding o intervención de Zaltyko.
- `no prometible`: hay código o una idea, pero no debe venderse todavía.
- `bloqueada`: depende de una configuración o validación externa explícita.

## Matriz operativa

| Objeción | Respuesta aprobada | Producto que la respalda | Evidencia de cierre | Estado de salida |
| --- | --- | --- | --- | --- |
| Ya usamos WhatsApp y Excel | Zaltyko conecta datos, tareas y seguimiento en un solo flujo. | Atletas, grupos, clases, asistencia, cobros, comunicación e historial. | Demo completa sin duplicar el mismo dato en otra herramienta. | acompañada |
| No sé si recuperaré la inversión | Zaltyko ayuda a reducir trabajo manual y hace visibles cobros y tareas pendientes. | Dashboard, billing, recordatorios, reportes y eventos de activación. | Trials observados con time-to-value, horas administrativas y seguimiento de pendientes. | bloqueada |
| Mi equipo no lo utilizará | Cada rol empieza con las tareas que necesita y puede avanzar por etapas. | Roles, permisos, navegación por perfil, onboarding y ayuda contextual. | Owner, coach y staff completan sus recorridos; métricas de activación por rol. | acompañada |
| Migrar será demasiado trabajo | La base se puede importar y las migraciones complejas se acompañan. | Importación CSV/Excel, validación, onboarding y soporte. | Importación con errores visibles, resumen final y al menos un caso real acompañado. | acompañada |
| No quiero perder el control | El director conserva la visión global y decide quién accede a cada dato. | Panel, permisos, auditoría y exportaciones. | Pruebas positivas y negativas por rol y academia, incluida prueba cross-academy. | acompañada |
| Será demasiado complicada | Las tareas diarias se presentan como acciones cortas, claras y adaptadas al móvil. | Dashboard, cockpit de clase, navegación móvil, estados y ayuda. | Tareas core completadas por usuarios reales sin asistencia técnica. | acompañada |
| Mi academia es diferente | Se configuran disciplina, grupos, niveles, horarios y cobros; las necesidades especiales se diagnostican. | Configuración sport-aware, grupos, clases, billing y Network acompañado. | Dos configuraciones de academia distintas completan el flujo core. | acompañada |
| Los pagos pueden generar problemas | Los cargos, estados, recordatorios, recibos y reembolsos quedan trazables. | Billing, Stripe, webhook idempotente, recordatorios, recibos y refunds. | QA de pago correcto, fallo, reembolso, duplicado y fuera de orden. | bloqueada |
| ¿Qué pasa con los datos de menores? | El acceso se separa por academia, relación y rol; Zaltyko no promete seguridad absoluta. | Auth, tenant scope, portal familiar limitado, RLS y auditoría. | Matriz parent/athlete/coach/owner, negativa cross-academy y revisión de copy. | acompañada |
| No quiero obligar a las familias a usar otra app | El portal muestra solo información útil; la comunicación principal queda trazable en Zaltyko. | Portal parent/athlete, mensajes, avisos, notificaciones e historial. | QA humana con familias vinculadas y flujo sin destinatarios válidos. | acompañada |
| Si me voy perderé mis datos | Los datos exportables siguen disponibles según el módulo y la política de salida. | Exportaciones de atletas, reportes, transacciones y asistencia. | Catálogo por módulo, exportación autorizada y prueba de cancelación/salida. | acompañada |
| ¿Y si no recibo soporte? | El acompañamiento y el canal de ayuda dependen del plan y del alcance contratado. | Help center, tickets, onboarding y soporte Super Admin. | Rutas de tickets estandarizadas y verificadas; falta evidencia histórica para publicar SLA temporal. | acompañada |

## Prioridad de ejecución

1. Activación y demo core: atletas, grupos, asistencia, cobros y comunicación.
2. Adopción: onboarding por rol, importación y ayuda contextual.
3. Confianza: permisos, familias, exportación, pagos y lenguaje de seguridad.
4. Operación comercial: soporte por plan, discovery, demo, métricas y casos reales.

## Regla de rediseño

Se pueden rediseñar, simplificar, ampliar o sustituir módulos y flujos cuando eso
mejore claridad, adopción, accesibilidad, rendimiento, conversión o eficiencia
operativa. Los cambios deben conservar la seguridad multi-tenant, los límites de
pricing, la integridad de pagos y la compatibilidad necesaria, o documentar una
migración/versionado explícito si se modifica un contrato.

## Criterio final

El mapa queda cerrado cuando las doce filas tienen estado `cerrada` o un estado
comercial explícito (`acompañada`, `no prometible` o `bloqueada`) con owner,
criterio, evidencia y mensaje aprobado. No se maquillan gaps como funcionalidades
listas ni se fabrican testimonios, métricas o resultados.

## Inventario actual de salida de datos

| Área | Formato/capacidad actual | Alcance comercial permitido |
| --- | --- | --- |
| Atletas | XLSX con ficha, grupo y familias visibles para el rol autorizado. | Exportación de atletas; no equivale a una copia completa de toda la academia. |
| Transacciones | CSV o XLSX con cargos, estado, fechas y atleta. | Control operativo; no prometer exportación contable/fiscal completa. |
| Asistencia | PDF o XLSX con filtros de academia, grupo, clase, atleta y periodo. | Reporte operativo y entrega acompañada. |
| Finanzas/progreso | PDF o XLSX mediante reportes específicos. | Exportación según módulo y permisos. |
| Evaluaciones | XLSX con evaluaciones y resumen por tipo. | Historial técnico exportable. |
| Eventos/competiciones | Exporta la información operativa disponible; los listados federativos específicos se revisan según formato. | XLSX de eventos, ubicación, estado, inscripción y participantes autorizados; no prometer formato federativo automático. |

La experiencia de salida debe explicar el módulo, formato, filtros, permisos y
limitaciones antes de descargar. Cancelación y borrado siguen dependiendo de la
política de privacidad y de cualquier obligación de conservación aplicable.

## Evidencia técnica acumulada — 2026-07-23

- Suite completa: 103 archivos y 674 tests PASS.
- Lint global: PASS.
- Auditoría estricta de APIs: `risky=[]`, `semanticRisks=[]`, `resourceScopeManualReview=0`.
- Claims públicos: catálogo de planes, trial y guardrails de copy PASS.
- Comunicación programada: GET/POST, entrega, escape HTML y fallo sin destinatarios PASS.
- Pendientes que no se pueden cerrar con evidencia local: entrevistas reales, trials observados, QA humana parent/athlete, entrega externa Brevo/KV/Stripe Connect, adaptación a un formato federativo específico y SLA histórico de soporte.
