---
status: active
owner: marketing
last_reviewed: 2026-06-22
source:
  - ../docs/marketing/zaltyko-metrics.md
---
# Metricas de marketing y producto

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
