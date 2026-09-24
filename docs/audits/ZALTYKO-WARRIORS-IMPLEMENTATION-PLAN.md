# ZALTYKO × WARRIORS — Implementation plan

Este plan convierte la auditoría en trabajo ejecutable. **No implementa código ni migraciones.** Las tareas empiezan solo después de validar el piloto, el consentimiento y las decisiones de producto.

## Orden de dependencias

```text
Discovery y métricas
  → pipeline lead/trial/enrollment
  → experiencia de coach y familia
  → modelo histórico de skills/evaluaciones
  → pagos/comunicación/localización del piloto
  → migración gradual y expansión federativa
```

## Epic 0 — Design partner discovery y baseline

**Valor:** evita construir para una hipótesis. **Dependencias:** ninguna. **Complejidad:** S. **Riesgo:** Low.

### Features

- Entrevista contextual owner/front desk/coach/padre.
- Inventario de fuentes actuales: WhatsApp, Drive, hojas, WooCommerce, pagos y calendarios.
- Definición de métricas: lead→trial, trial→enrollment, tiempo de matrícula, asistencia semanal, pagos recuperados y publicación de progreso.

### Tareas técnicas

- Crear un mapa de eventos de dominio sin persistir nuevos datos todavía.
- Identificar tenants/piloto y permisos de prueba.
- Preparar fixture anonimizado de una clase, una familia y una evaluación.

**Archivos probables:** `docs/audits/*`, `src/lib/analytics/*`, contratos de tests existentes.  
**DB/API/UI:** ninguna nueva en esta fase.  
**Tests/aceptación:** un owner y un coach pueden describir el flujo actual; cada métrica tiene definición, fuente y responsable; no se usan datos privados sin consentimiento.

## Epic 1 — Pipeline comercial lead → trial → enrollment

**Valor:** desbloquea conversión y atribución. **Dependencias:** Epic 0. **Complejidad:** M. **Riesgo:** Medium.

### Feature 1.1 — Estado comercial unificado

**Current:** `leads` y `academyTrials` existen, pero no hay evidencia de una relación completa con enrollment/athlete/charge.  
**Technical tasks:** añadir referencias nullable (`leadId`, `trialId`) donde corresponda; estados explícitos (`new`, `contacted`, `booked`, `attended`, `no_show`, `won`, `lost`); timestamps y owner; deduplicación por email/teléfono dentro de tenant.  
**Files likely affected:** `src/db/schema/leads.ts`, `src/db/schema/academy-trials.ts`, `src/app/api/*lead*`, `src/app/api/*trial*`, `src/lib/analytics/*`.  
**Database:** migración additive, índices tenant/status, constraints de estado.  
**API:** endpoints de transición idempotentes y auditables.  
**UI:** bandeja simple de leads/trials, siguiente acción, resultado y CTA de convertir.  
**Tests:** authorization/tenant, transitions, duplicate lead, retry/idempotency, analytics event.  
**Acceptance:** un lead de WhatsApp/formulario puede convertirse en trial y en atleta/enrollment sin reescribir datos; cada transición queda visible y medible.

### Feature 1.2 — Trial operativo

**Current:** `classes.allowsFreeTrial` y `academyTrials` cubren piezas.  
**Tasks:** reservar una plaza o waitlist, confirmar consentimiento, registrar asistencia/no-show, feedback del coach y siguiente acción.  
**Files:** classes/trial schemas, calendar, communications, family/athlete components.  
**DB/API/UI:** preferir reutilizar clases, sesiones y notificaciones; no crear “trial class” paralela.  
**Tests:** capacity race, cancellation policy, timezone, reminder delivery.  
**Acceptance:** front desk puede reservar, el coach ve el trial en su sesión y owner puede convertirlo o marcarlo perdido.

## Epic 2 — Coach workflow de sesión

**Valor:** crea el hábito y datos de calidad. **Dependencias:** Epic 1. **Complejidad:** M. **Riesgo:** Medium.

### Features

- Vista móvil “hoy”: sesión, grupo, coach, atletas, ausencias y alertas.
- Pase de lista offline-tolerante o con reintento; cierre de sesión.
- Observación rápida y skill update sin abandonar la lista.

**Files likely affected:** `src/components/coaches/*`, `src/components/attendance/*`, `src/components/classes/*`, `src/app/api/attendance/*`, `src/db/schema/attendance-records.ts`, `src/db/schema/class-sessions.ts`.  
**DB/API:** reutilizar `attendanceRecords`; añadir idempotency key/event log solo si el piloto demuestra reintentos duplicados.  
**UI:** botones grandes, estados `pending/saved/failed`, cola de reintentos, resumen de cierre.  
**Tests:** teclado/touch, duplicate submission, coach authorization, timezone, partial network failure.  
**Acceptance:** un coach registra 20 atletas en menos de dos minutos en móvil y sabe con certeza qué se guardó.

## Epic 3 — Parent value loop

**Valor:** retención familiar. **Dependencias:** Epic 2. **Complejidad:** M. **Riesgo:** Medium.

### Features

- Home familiar con próxima sesión, asistencia reciente, saldo y aviso importante.
- Notificación de evaluación/observación compartida con consentimiento.
- Acciones de pago, ausencia, waitlist y evento desde contexto.

**Files:** `src/components/profiles/ParentProfile.tsx`, `src/app/app/[academyId]/my-dashboard/*`, guardians, notifications, billing.  
**DB/API:** reutilizar `guardians`, `guardianAthletes`, `charges`, `notifications`, `coachNotes`; añadir solo preferencias/event types faltantes.  
**Tests:** guardian isolation, multiple children, revoked link, notification preference, mobile accessibility.  
**Acceptance:** el padre entiende qué debe hacer hoy y puede completar la acción sin WhatsApp manual del owner.

## Epic 4 — Athlete skill history y evaluations

**Valor:** vertical moat y promoción basada en evidencia. **Dependencias:** Epic 2 y definición del estándar en Epic 0. **Complejidad:** L. **Riesgo:** High.

### Feature 4.1 — Fuente canónica de configuración deportiva

**Current:** `athleteSportConfigs` convive con campos legacy en `athletes`; `programs`, `levels`, `categories`, `apparatus` están en configuración.  
**Tasks:** elegir `athleteSportConfigs` como fuente canónica; inventariar discrepancias; dual-read y luego dual-write detrás de flag.  
**Files:** schemas, athlete APIs/forms, terminology, seeds/templates.  
**DB:** backfill reversible y reporte de discrepancias; no borrar legacy en primera migración.  
**Tests:** multi-sport, historical read, permission and rollback.  
**Acceptance:** una consulta canónica devuelve el mismo programa/nivel visible en owner, coach y parent.

### Feature 4.2 — AthleteSkill histórico

**Propuesta:** entidad con `tenantId`, athlete, skill/catalog version, state, evidence, coach, observedAt, reviewedAt y source.  
**Files likely affected:** `src/db/schema/skill-catalog.ts`, new service/API under `src/app/api/skills/*`, athlete profile, coach session, parent progress.  
**DB:** tabla additive, unique active state por atleta/skill/version si aplica, índices tenant/athlete.  
**API:** bulk upsert idempotente, history read, publish/unpublish.  
**UI:** quick update en sesión; detalle histórico y filtro por aparato/programa.  
**Tests:** state transitions, snapshot isolation, tenant, coach/parent visibility, bulk retry.  
**Acceptance:** actualizar un skill no borra el estado anterior y una evaluación reproduce el catálogo usado en esa fecha.

### Feature 4.3 — Evaluation snapshot y promotion decision

**Current:** `athleteAssessments`, `assessmentScores`, rubrics, videos y comments existen; score/totalScore tienen semántica flexible.  
**Tasks:** versionar rubric/catalog snapshot, explicitar escala/unidad, separar recomendación de promoción de decisión aprobada.  
**Files:** assessment schemas/services/components/reports.  
**DB/API:** migración additive (`scale`, `unit`, `snapshotVersion`, `decisionStatus`); adaptar lecturas legacy.  
**Tests:** rounding, missing apparatus, publish permissions, historical rendering.  
**Acceptance:** coach puede evaluar, owner aprobar/promover y padre ver un informe entendible con fecha y evidencia.

## Epic 5 — Billing y comunicación local del piloto

**Valor:** operación real en Colombia. **Dependencias:** Epic 1 y 3. **Complejidad:** M. **Riesgo:** High por dinero.

### Tasks

- Confirmar medios reales de Warriors: COP, transferencia, efectivo, tarjeta, PSE u otro.
- Mapear cada rail a `charges`/receipts y reconciliación; no inventar soporte.
- Plantillas WhatsApp/email con opt-in, idioma, zona horaria y estado de entrega.
- Recordatorios de trial, cuota, pago fallido y evaluación.

**Files:** currency/payment adapters, billing components, communication/WhatsApp APIs, notification preferences.  
**Tests:** idempotency, amount/currency, webhook signature, consent, failed delivery.  
**Acceptance:** una cuota del piloto se registra, cobra/conciliates y notifica correctamente; una falla tiene recuperación clara.

## Epic 6 — Rooms, capacity, waitlist y makeups

**Valor:** eficiencia y retención, después de probar el núcleo. **Dependencias:** Epics 1–3. **Complejidad:** M/L. **Riesgo:** Medium.

**Tasks:** confirmar si Warriors necesita sedes/salas; extender clases/sessions con room cuando exista caso; parametrizar waitlist, makeup tokens y cancelación.  
**No iniciar si:** una sola sede y clases pequeñas no producen dolor medible.  
**Acceptance:** no hay sobre-reserva y una ausencia recuperable no requiere hoja manual.

## Epic 7 — Federation adapters (P2)

**Valor:** expansión competitiva. **Dependencias:** Epic 4 + cliente afiliado + documento de versión. **Complejidad:** L/XL. **Riesgo:** High.

**Tasks:** adapter por organismo/país, import/export oficial, licencias y resultados con provenance.  
**No construir:** sincronización bidireccional genérica USAG/FIG/RFEG sin contrato o sandbox oficial.  
**Acceptance:** un meet real puede importar/exportar sin cambiar el significado de scores ni exponer datos de otro tenant.

## Quality gates before production

1. `pnpm typecheck`, `pnpm lint`, `pnpm build`.
2. Suite security y contratos tenant/RBAC.
3. E2E autenticada con cuentas de prueba autorizadas y datos sintéticos.
4. Prueba móvil de coach y parent con red lenta/intermitente.
5. Revisión de accesibilidad: focus, labels, contraste, target size, errores persistentes.
6. Verificación de métricas y rollback de migración.
7. Deploy separado del piloto y smoke de `/api/health`, auth, billing y storage.

## Global acceptance criteria

- Ningún rol termina en un onboarding incorrecto.
- Una academia puede pasar de lead a trial, enrollment, grupo, sesión, asistencia, evaluación, mensaje y cobro sin duplicar datos.
- El padre ve solo sus hijos y entiende la siguiente acción.
- El coach registra datos en el contexto de la clase sin fricción.
- La historia deportiva no se sobrescribe y soporta más de un deporte/país.
- Todas las operaciones sensibles son tenant-scoped, autorizadas, auditables e idempotentes.
- Los estados de error son visibles y recuperables; no hay “no pasó nada”.
- El producto puede decir NO a una integración o feature sin bloquear el núcleo.
