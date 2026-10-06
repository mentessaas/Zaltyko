# ADRs del nuevo núcleo Zaltyko

Estado de esta serie: **aceptada para implementación incremental en la rama
`codex/health-score-v2`**.

Estas decisiones toman como especificación principal el
`PRD-Zaltyko-Owner-Dashboard-Academy-Health-Score.md` del 6 de octubre de 2026.
El código legado es evidencia de reglas aprendidas, no una restricción de
compatibilidad. Ninguna decisión autoriza migraciones remotas, despliegues,
Stripe Live ni cambios de credenciales.

| ADR                                                  | Decisión                                          |
| ---------------------------------------------------- | ------------------------------------------------- |
| [0001](./0001-frontera-canonica-zaltyko.md)          | Esquema y lenguaje canónicos del nuevo dominio    |
| [0002](./0002-inscripcion-y-pertenencia-a-grupos.md) | Inscripción fechada y pertenencia M:N a grupos    |
| [0003](./0003-ledger-financiero-interno.md)          | Ledger interno separado del procesador de pagos   |
| [0004](./0004-outbox-idempotencia-y-auditoria.md)    | Outbox transaccional, idempotencia y audit log    |
| [0005](./0005-metricas-health-score-e-insights.md)   | Dependencias y reproducibilidad de inteligencia   |
| [0006](./0006-familias-trials-y-lista-de-espera.md)  | Familias, trials, waitlist y reserva de capacidad |
| [0007](./0007-arranque-limpio-y-cutover-owner.md)    | Arranque limpio y corte de superficie owner       |
| [0008](./0008-actor-de-sistema-para-workers.md)      | Actor de sistema explícito para workers           |

Contrato analítico inicial: [diccionario de métricas v0](../metric-dictionary-v0.md).
