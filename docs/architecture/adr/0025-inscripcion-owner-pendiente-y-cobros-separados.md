# ADR-0025: Alta owner pendiente y facturación desacoplada

- Estado: aceptada para implementación incremental
- Fecha: 2026-10-13
- Contexto: PRD Owner Dashboard y Academy Health Score, sección 10.4

## Contexto

El equipo owner necesita asignar una persona existente a una clase y mantener
capacidad, estado e historial fiables. La inscripción no debe confundirse con
la pertenencia M:N a grupos, con una prueba gratuita ni con un cargo familiar.
Los datos greenfield ya modelan esos conceptos en entidades y servicios
distintos.

## Decisión

- La creación owner acepta únicamente personas activas ya vinculadas a la sede
  por `group_memberships` canónica o por otra inscripción abierta en esa sede.
- El comando owner fija en servidor `status=pending`, `source=owner` y
  `pricePlanId=null`. La fecha debe quedar dentro del periodo efectivo de la
  plantilla. Se reserva capacidad transaccionalmente, incluyendo pendientes,
  pruebas, activos y pausados, y se rechazan duplicados abiertos en la misma
  clase.
- Activar, pausar, cancelar y completar son transiciones explícitas con
  `expectedVersion`, fecha efectiva, clave idempotente, autorización tenant/sede
  y bloqueo de concurrencia. Trials y transferencias permanecen en sus flujos
  específicos; no se improvisan desde el formulario básico.
- Cada escritura del dominio produce historial, audit log y evento de outbox en
  la misma transacción. Los registros de auditoría y outbox no copian nombres.
- Enrollment no crea cuotas, facturas, cobros, métodos de pago ni mandatos; el
  ledger familiar y los cobros automáticos son flujos separados.
- Los endpoints verifican sesión y rol en servidor, derivan el actor de la
  sesión, vuelven a comprobar acceso y cupo en la transacción, limitan la
  búsqueda a la academia/sede autorizada, aplican rate limit y respuestas
  `private, no-store`. RLS/grants de la base siguen siendo defensa adicional y
  sus pruebas deben ejecutarse en una base aislada antes de habilitar clientes.

## Consecuencias

Se puede reservar una plaza en pocos pasos sin activar accidentalmente pagos.
Una persona puede tener inscripciones diferentes para clases y actividades,
sin colapsar la relación M:N de grupos. Las operaciones son reintentables y
reconstruibles por historia tipada; los insights consumen datos operativos sin
PII.

El flujo inicial no cubre transferencias, alta de personas, trials, waitlist ni
cobros. Esas capacidades quedan separadas por dominio y se añaden con sus
propios contratos y gates. No se requiere una migración nueva para este corte.

## Verificación

Pruebas locales focales de rutas y componentes, harness PostgreSQL sintético
para capacidad/duplicados/fechas/scope, TypeScript y ESLint. No se ha ejecutado
E2E con sesión real ni se ha aplicado SQL remoto o cambiado producción.
