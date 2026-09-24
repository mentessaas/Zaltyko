# Plan de implementación competitivo de Zaltyko

Fecha: 2026-09-12  
Estado: propuesta para revisión de Product Lead/Board  
Fuente: `COMPETITIVE_INTELLIGENCE.md`, `ZALTYKO_CAPABILITY_AUDIT.tsv`, `vault/01-Producto/Vision y propuesta de valor.md`, `vault/00-Inicio/Guia de trabajo para agentes.md`.

## 1. Decisión de enfoque

Sí tiene sentido implementar una parte del análisis competitivo para el nicho y buyer persona actuales: academias pequeñas/medianas de gimnasia artística/rítmica en español, con owner/director como comprador, coach como usuario operativo y familia como usuario final limitado. No tiene sentido perseguir ahora un ERP enterprise, marketplace obligatorio, EMR, predicción de lesiones, ranking de menores o una plataforma de vídeo propia.

La estrategia es **paridad operativa + diferenciación de desarrollo**, respetando la dirección vigente: gimnasia primero, comunicación interna primero, portal familiar limitado, pricing v3.0 sin cambios y WhatsApp secundario.

## 2. Principios para no pisar trabajo ajeno

1. Este plan es documentación; no modifica código, schema, pricing ni producción.
2. Cada fase debe reservar un único owner y una lista explícita de archivos/rutas; otros agentes no deben editar el mismo scope sin handoff.
3. Antes de abrir una issue, comprobar `git status`, `git log -3 -- <archivo>`, Changelog interno y Backlog priorizado.
4. Ningún claim pasa a “implementado” por existir un schema o una ruta: exige prueba UI/API/E2E y datos controlados.
5. Toda migración, permiso, pricing o promesa pública requiere revisión del vault correspondiente.

## 3. Fases y gates

### Fase 0 — baseline y coordinación (1–2 días, sin features)

**Objetivo:** cerrar el mapa de estado actual antes de construir.

- Ejecutar `pnpm exec tsx scripts/audit-api-routes.ts --strict` y conservar el resultado.
- Resolver la configuración Playwright (Vitest/ESM y spec que importa otro spec); no crear pruebas duplicadas.
- Preparar una academia demo aislada y credenciales aprobadas; nunca fabricar credenciales.
- Ejecutar smoke de `/app/[academyId]` y registrar por capacidad `pass | partial | fail | blocked` en `ZALTYKO_CAPABILITY_AUDIT.tsv`.

**Gate G0:** no quedan rutas críticas sin clasificación o, si quedan, tienen owner y bloqueo explícito.

### Fase 1 — núcleo que gana al stack WhatsApp/Sheets/PSP (P0, 1–2 sprints)

**Objetivo:** que owner, coach y familia completen el ciclo diario sin herramientas paralelas.

1. Portal familiar limitado: varios hijos, calendario, RSVP, asistencia, progreso publicado, facturas y notificaciones; mantener bloqueadas rutas administrativas.
2. Checkout multi-actividad/familia: revisar modelo actual, prorrateo, hermanos, becas, fallos, reintentos, recibos y límites; sin alterar pricing v3.0.
3. Waitlist y capacidad: promoción determinista, notificación y auditoría; validar clases y eventos por separado.
4. Comunicaciones internas accionables: anuncios por grupo/actividad, RSVP y timeline; WhatsApp sólo como fallback opt-in.
5. Migración Excel/CSV: preview, deduplicación, mapeo y rollback; conservar exportación completa.

**Gate G1:** seis workflows E2E pasan con datos controlados: alta de familia+dos hijos, compra multi-actividad, pago fallido/recuperado, cambio de grupo, RSVP/asistencia y exportación.

### Fase 2 — diferenciación de desarrollo (P1, 2–3 sprints)

**Objetivo:** superar a schedulers genéricos con evidencia de progreso específica de gimnasia.

1. Cerrar `AssessmentHub`: historial comprensible, comparación por aparato, PDF/export y permisos.
2. Evidence loop: objetivo → sesión → asistencia → evaluación/vídeo → feedback familiar → siguiente objetivo.
3. Curriculum configurable por aparato/nivel, con versión y trazabilidad; reutilizar componentes existentes.
4. Tryouts/evaluación multi-estación con calibración de evaluadores y notas privadas/publicables.
5. Consent ledger para fotos/vídeos/documentos: alcance, caducidad, revocación y exportación.

**Gate G2:** cada evaluación publicada enlaza evidencia, rúbrica, evaluador, fecha y siguiente objetivo; guardian sólo ve contenido liberado.

### Fase 3 — localización y crecimiento (P1, después de G1)

**Objetivo:** servir España/LatAm sin forks ni promesas prematuras.

- `PaymentProviderAdapter`: Stripe/SEPA primero; MercadoPago/Wompi/otros sólo con buyer evidence.
- `TaxDocumentAdapter`: IVA/AEAT primero; DIAN/SRI/GST como módulos posteriores.
- `MessagingAdapter`: email/push interno primero; WhatsApp Business opt-in secundario.
- Migración asistida y calculadora de coste total; pricing v3.0 permanece fuente única.

**Gate G3:** añadir un país mediante adaptador, fixtures y pruebas de cumplimiento; no se acepta lógica regional dispersa.

### Fase 4 — IA y multimedia (P2, sólo con evidencia)

**Objetivo:** automatizar trabajo repetitivo sin convertir IA en árbitro de menores.

- AI action sandbox con vista previa, permisos y aprobación humana.
- Alertas explicables de ausencia/morosidad/churn; no diagnóstico ni ranking.
- Conectores de vídeo/live externos sólo después de consentimiento y coste medido.
- Consultas de lenguaje natural limitadas al scope autorizado y con procedencia de datos.

**Gate G4:** piloto con baseline y holdout; rollback de cada automatización; cero acciones irreversibles sin aprobación.

## 4. Matriz de ownership y límites

| Workstream | Owner propuesto | Scope de archivos | No tocar |
|---|---|---|---|
| Baseline/E2E | QA | `tests/`, configs Playwright, `ZALTYKO_CAPABILITY_AUDIT.tsv` | pricing, DB, producción |
| Familias/portal | Mobile + Web | `mobile/app/family`, `src/app/app/[academyId]/my-dashboard`, componentes family | rutas admin/RLS sin revisión |
| Billing | Web + Platform | `src/app/app/[academyId]/billing`, `src/app/api/billing`, tests billing | pricing v3.0, secretos live |
| Evaluaciones | Product Web | `src/components/assessments`, `src/app/app/[academyId]/assessments`, tests | EMR/diagnóstico |
| Localización | Platform | adaptadores y fixtures regionales | forks, migraciones destructivas |
| IA | AI/Platform | `src/lib/ai`, `src/app/api/ai`, sandbox UI | decisiones automáticas sobre menores |

Si no existe owner aprobado, la tarea queda en backlog y no se abre trabajo paralelo sobre el mismo scope.

## 5. Métricas de decisión

- TTFAA: tiempo desde alta hasta primera sesión/primer cobro.
- Activación familiar: % de familias con dos hijos que completan RSVP y consultan factura.
- Cobro: tasa de pago exitoso, recuperación de fallo y conciliación.
- Operación: minutos para pasar asistencia y publicar evaluación.
- Desarrollo: % de evaluaciones con evidencia y siguiente objetivo.
- Calidad: errores/duplicados de migración, entregabilidad y permisos indebidos.
- Negocio: conversión trial→pago, churn y coste total por academia; no publicar porcentajes con N<3.

## 6. Criterios Go/No-Go

**Go:** G0/G1 pasan, buyer persona confirma dolor en al menos 3 academias y no se rompe pricing/aislamiento.  
**No-Go/pausa:** E2E no reproducible, pagos no conciliados, guardian ve datos ajenos, coste de PSP no transparente o feature sólo defendida por claim competitivo.

## 7. Entregables para el siguiente agente

- Actualizar `ZALTYKO_CAPABILITY_AUDIT.tsv` con evidencia de cada workflow.
- Convertir OPP-01…OPP-16 en issues sólo tras G0.
- Mantener `COMPETITIVE_INTELLIGENCE.md` como fuente de competencia; este plan como secuenciación.
- Registrar cada cambio relevante en Changelog interno y vault; declarar migraciones no aplicadas.

## 8. Trazabilidad OPP → ejecución

| OPP | Fase | Owner único sugerido | Dependencias | Criterio de salida |
|---|---|---|---|---|
| OPP-01 checkout multi-actividad | 1 | Billing/Web | catálogo de planes, guardianes, Stripe test | compra de dos actividades, prorrateo y refund E2E |
| OPP-02 migración preview/rollback | 1 | Platform/Data | contrato CSV, dedupe, auditoría | fixture con duplicados importado y revertido sin pérdida |
| OPP-03 portal guardian/RSVP | 1 | Mobile | permisos family, calendario | guardian ve sólo hijos y RSVP actualiza asistencia |
| OPP-04 PSP local/SEPA | 3 | Platform/Payments | adaptador, fiscalidad, buyer evidence | país piloto con conciliación y compliance |
| OPP-05 consentimiento media | 1–2 | Web/Security | documentos/asset metadata, guardian scope | revocar consentimiento impide acceso y exporta log |
| OPP-06 curriculum/sesiones | 2 | Product Web | skill catalog, assessments | coach crea sesión y enlaza objetivo en <5 min |
| OPP-07 evidence loop | 2 | Product Web | assessment + attendance + media | evaluación publicada muestra evidencia y siguiente objetivo |
| OPP-08 tryouts/calibración | 2 | Product Web/QA | rúbricas, roles evaluador | scoring multi-estación y reporte de acuerdo |
| OPP-09 IA sandbox | 4 | AI/Platform | audit log, permisos, prompts | borrador/aprobación/rollback probado |
| OPP-10 skill graph portable | 2–3 | Data/Platform | IDs de habilidades, export contract | importar/exportar dos deportes sin pérdida |
| OPP-11 waitlist/capacidad | 1 | Web/Scheduling | sesiones, notificaciones | promoción determinista y no sobreventa |
| OPP-12 pricing transparente | 0–3 | Product/GTM | pricing v3.0, instrumentación | calculadora TCO y conversión medida |
| OPP-13 vídeo/live conectores | 4 | Platform/Media | consentimiento, storage budget | clip enlazado a evento y retención aplicada |
| OPP-14 readiness explicable | 4 | AI/Safety | evidencia suficiente, revisión humana | factores/uncertainty visibles; sin decisiones automáticas |
| OPP-15 marketplace interno | 4 | Product Ops | multi-sede, disponibilidad coaches | asignación de huecos con privacy tests |
| OPP-16 localización adapters | 3 | Platform | contratos PSP/tax/messaging/consent | segundo país sin fork y suite de compliance |

### Plantilla de issue derivada

Cada issue creada desde esta tabla debe incluir: `OPP-ID`, fase/gate, owner, archivos permitidos, archivos prohibidos, estado actual desde `ZALTYKO_CAPABILITY_AUDIT.tsv`, evidencia competitiva enlazada, baseline, prueba de aceptación, riesgo de privacidad, plan de rollback y nota de migración (aplicada/no aplicada). Si falta cualquiera de esos campos, queda en discovery y no en implementación.

### Contrato provisional para OPP-02 (importación)

Para poder implementar el preview sin fusionar atletas incorrectamente, el contrato recomendado es:

- `externalId` opcional por fila, único por academia cuando se proporciona; es la única identidad fuerte para actualizar o saltar un registro existente.
- `name + dob` no deduplica automáticamente: sólo genera un conflicto visible en preview para revisión del owner.
- Sin `externalId` ni coincidencia revisable, la fila se propone como alta nueva y requiere confirmación antes de persistir.
- Preview debe devolver filas válidas, conflictos, errores de esquema y estimación de límites; no escribe DB.
- La aplicación debe usar un `importBatchId` auditable y una transacción por lote; rollback sólo revierte filas creadas por ese batch, nunca registros preexistentes.

Este contrato es una recomendación de arquitectura, no una migración aplicada ni una decisión comercial irreversible.

## 9. Orden de ejecución recomendado

`G0 → OPP-03/11 → OPP-01 → OPP-02 → G1 → OPP-05/06/07/08 → G2 → OPP-04/12/16 → G3 → OPP-09/13/14/15 → G4`.

La secuencia prioriza primero valor para familias y operación diaria, después diferenciación de desarrollo y sólo al final expansión regional/IA. Cualquier agente que proponga saltarse un gate debe aportar evidencia de buyer persona y aprobación de Product Lead/Board.
