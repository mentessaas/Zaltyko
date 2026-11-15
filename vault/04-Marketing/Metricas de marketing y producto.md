---
status: active
owner: marketing
last_reviewed: 2026-08-12
source:
  - ../docs/marketing/zaltyko-metrics.md
  - ../../ZAL/issues/ZAL-580  # contrato de instrumentación de outreach (source-of-truth)
  - ../../ZAL/issues/ZAL-576  # brief GTM que motiva marketing_first_value como definición ligera
---

# Metricas de marketing y producto

> **Source-of-truth del contrato de instrumentación:** las definiciones de
> fuente, evento, denominador y ventana para los reportes de outreach las fija
> Data en el documento `key=instrumentation` de ZAL-580. Este doc canónico de
> marketing refleja esa decisión; cualquier cambio debe pasar por una PR que
> cite ZAL-580 como ancla y, si cambia el contrato, reabrir el veredicto allí.

## Adquisicion

- Visitantes unicos.
- Trafico organico.
- CPL y MQL cost.
- Conversion visitante -> lead.
- Conversion visitante -> signup.

## Activacion

- Signup iniciado/completado.
- Academia creada.
- Primer atleta creado/importado.
- Primera clase creada.
- Primer cobro o reporte visto.
- Time-to-value.

Los hitos autenticados se persisten en `growth_events` desde servidor y deben
reconciliarse por academia, no solo por navegación anónima. Eventos mínimos para
el cierre del mapa: `academy_created`, `first_athlete_added`,
`first_group_created`, `first_coach_invited`, `payments_configured`,
`first_parent_invited`, `message_sent` y `academy_activated`.

El panel de Growth muestra ahora `academy_activated` como academias activadas
distintas, separado de visitas, trials y pagos. No se convierte en tasa hasta
que exista un denominador válido y datos reales suficientes.
También calcula el time-to-value medio únicamente cuando existen pares válidos
`academy_created` → `academy_activated`; con menos de un par muestra que no hay
base, sin rellenar con fixtures ni ceros.

No se calcularán tasas comerciales con denominador cero ni se tratarán eventos
locales o fixtures como evidencia de clientes reales.

### Activacion / First Value (decision ZAL-580, 2026-08-11)

**Canónico para reporte ejecutivo:** `first_value = academy_activated`.

- `academy_activated` ya se emite desde el producto real (`src/lib/onboarding.ts:190`),
  está reconciliado por academia en `growth_events` y lo reporta el dashboard
  de Growth (`src/lib/growth/dashboard.ts:179-187`).
- Cuenta una academia si y solo si existe al menos una fila en `growth_events`
  con `event_name = 'academy_activated'` y `academy_id = academy.id`, y la
  academia cumple `status = 'active' AND deleted_at IS NULL AND source NOT IN
  ('qa-internal','seed','migration','test')`.

**Definición ligera del brief ZAL-576 (NO usar como `first_value`):** la
propuesta inicial del brief de GTM — `academy_created` +
`first_athlete_added` + `first_group_created` — captura intención temprana,
no activación real. Mezclarla con `first_value` infla el numerador y confunde
"primer valor" con "primer login" para un ejecutivo.

- Si el board confirma esa definición ligera, se publica como métrica separada
  `marketing_first_value` (evento o sub-cuenta en la cohorte) y se mantiene
  `first_value` canónico paralelo. **Nunca** se mezclan en el mismo reporte.
- Cualquier desvío entre lo que diga este doc y el dashboard (`src/lib/growth/dashboard.ts`)
  es un bug: o se corrige el código para que refleje este doc, o se reabre
  ZAL-580 con evidencia para sustituir el canónico.

## Outreach: fuente / evento / denominador / ventana (ZAL-580)

Tabla copiada del documento `key=instrumentation` de ZAL-580. Define cómo se
concilian las 7 métricas de outreach (`attempts`, `replies`, `consented`,
`demos_held`, `first_value`, `trials_started`, `paid_conversions`) desde la
fuente primaria (`marketing_outreach`, opción A) y desde los JOINs ya vivos
contra `growth_events`, `commercial_interviews`, `academy_trials` y
`subscriptions`. Cualquier cambio en estas definiciones es competencia de
Data y se ancla en ZAL-580.

| Métrica | Numerador | Denominador | Fuente / evento | JOIN | Ventana de cohorte |
|---|---|---|---|---|---|
| `attempts` | filas en `marketing_outreach` con `sent_at` no nulo y `idempotency_key` no nulo, dentro de la campaña aprobada | mismo (es absoluto) | `marketing_outreach` (opción A) o sidecar CSV aceptado por board (opción C) | `marketing_outreach.campaign_id = ZAL-576.campaign_id` | desde `campaign_start_at` (definido por el board al aprobar T0) hasta T0+14d o hasta `corte`, lo que ocurra antes |
| `replies` | filas en `marketing_outreach` con `reply_at IS NOT NULL` y `reply_kind NOT IN ('unsubscribe')` | `attempts` | mismo | mismo | igual que `attempts` |
| `consented` | filas en `marketing_outreach` con `consent_at IS NOT NULL` y `consent_text_version` no nulo | `replies` | mismo (opción A); en opción C, `commercial_interviews.consent_at` con `consent_text_version` | `marketing_outreach.academy_id = commercial_interviews.lead_id` (cuando `lead_id` resuelve) | igual |
| `demos_held` | filas en `commercial_interviews` con `status='completed'`, `demo_ended_at IS NOT NULL` y `attendees_count >= 1` | `consented` | `commercial_interviews` (existente + extensión) | `commercial_interviews.id = marketing_outreach.demo_session_id` cuando existe; si no, por `commercial_interviews.academy_fingerprint = marketing_outreach.academy_fingerprint` en ventana | igual |
| `first_value` | academias con `growth_events` `academy_activated` en la ventana, con `academy_id` no nulo y academia activa | `demos_held` | `growth_events` evento `academy_activated` | `growth_events.academy_id = academies.id AND academies.status = 'active' AND academies.deleted_at IS NULL` | igual |
| `trials_started` | academias con `growth_events` `trial_started` en la ventana, reconciliables con academia activa | `first_value` (misma academia en ventana) | `growth_events` `trial_started` + `academy_trials` con `status='active'` | `growth_events.academy_id = academy_trials.academy_id` | desde `campaign_start_at` hasta T0+30d |
| `paid_conversions` | academias con `subscriptions` `status IN ('active','trialing')` y `stripe_subscription_id IS NOT NULL` en la ventana | `trials_started` (misma academia) | `subscriptions` + `growth_events` `trial_converted` | `subscriptions.tenant_id = growth_events.tenant_id` o vía `profiles.user_id` | desde `campaign_start_at` hasta T0+45d |

**Definición de "ventana de cohorte"** (alineada con ZAL-576 §3):

- **Cohorte:** academias con fila `marketing_outreach` para `campaign_id = ZAL-576.campaign_id`.
- **T0 externo (trigger):** la fecha que el CEO apruebe en el go/no-go de
  ZAL-576. Hasta entonces **no se ejecuta ningún outreach real** y por tanto
  `attempts = 0` por definición.
- **Corte operativo:** 14 días tras T0 para leer `attempts → demos_held`;
  30 días para `trials_started`; 45 días para `paid_conversions`.

## Retencion

- Login semanal por academia.
- Uso de features core.
- Atletas activos.
- Clases con asistencia registrada.
- Health score.
- Churn y expansion.

## Revenue

- MRR.
- ARPA/ARPU.
- Conversion Free -> Paid.
- Trial -> Paid.
- Expansion por plan/add-on.
- CAC payback.