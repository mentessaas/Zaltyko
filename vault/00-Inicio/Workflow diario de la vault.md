---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../AGENTS.md
  - Home
  - Backlog priorizado
---
# Workflow diario de la vault

## Antes de empezar trabajo

1. Leer [[Estado actual de Zaltyko]].
2. Revisar [[Backlog priorizado]] si la tarea no viene cerrada.
3. Abrir la nota del area afectada:
   - Producto: [[Inventario de producto]]
   - Tech: [[Arquitectura]] y [[Patrones obligatorios]]
   - Billing/pricing: [[Pricing]]
   - Marketing: [[Mensajes aprobados]]
   - Riesgos: [[Registro de riesgos]]

## Durante el trabajo

- Si aparece una decision, registrarla en [[Decisiones]].
- Si aparece deuda o follow-up, añadirlo a [[Backlog priorizado]].
- Si cambia una promesa publica, revisar [[Mensajes aprobados]].
- Si cambia pricing o limites, revisar [[Pricing]].
- Si cambia arquitectura, API, DB o deploy, revisar [[Arquitectura]], [[Runbook migraciones]] o [[Runbook deploy]].

## Antes de cerrar

Responder estas 5 preguntas:

1. ¿Cambio producto, negocio, marketing, ventas, tech, seguridad, deploy o roadmap?
2. ¿Que nota de `vault/` actualice?
3. ¿Cree deuda nueva o una tarea pendiente?
4. ¿Hay decision que deba quedar registrada?
5. ¿Ejecute pruebas proporcionales al riesgo?

## Cierre esperado

El cierre del trabajo debe decir una de estas dos cosas:

- `Vault actualizada: <nota>` cuando hubo cambio relevante.
- `Vault: no aplica` cuando fue un cambio menor sin impacto documental.

## Mapa por tipo de cambio

| Cambio | Nota obligatoria |
| --- | --- |
| Nueva feature o cambio de modulo | [[Inventario de producto]] y nota del modulo. |
| Bug que deja deuda | [[Backlog priorizado]] y [[Registro de riesgos]] si aplica. |
| Pricing, planes, limites, Stripe | [[Pricing]] y [[Modulo - Billing]]. |
| Copy publico, landing, ads, emails | [[Mensajes aprobados]]. |
| API, auth, permisos, RLS | [[Patrones obligatorios]] y nota tech relevante. |
| Migracion o schema | [[Runbook migraciones]] y [[Decisiones]] si cambia modelo. |
| Deploy, env vars, produccion | [[Runbook deploy]] y [[Produccion y go-live]]. |
| Auditoria nueva | [[Auditorias consolidadas]] o nota nueva en `07-Auditorias-y-Riesgos`. |
