# Operaciones de crecimiento — familias, trials y waitlist

- Estado: implementadas y verificadas localmente
- Fecha: 2026-10-06
- Alcance: PR-03 del plan Owner Dashboard / Academy Health Score

## Flujos canónicos

### Trial

1. Reservar un trial crea un enrollment `trial` en la sesión elegida y consume
   capacidad con el mismo lock que una inscripción ordinaria.
2. `attended`, `completed`, `no_show` y `cancelled` se guardan con versión e
   historial efectivo.
3. Completar o cerrar el trial completa/cancela el enrollment temporal.
4. Convertir crea un enrollment activo nuevo con `source = trial` y vínculo al
   trial origen. No reabre la inscripción temporal.
5. Un follow-up solo guarda canal, resultado y fecha; no acepta texto libre.

### Waitlist

1. La entrada apunta exactamente a una clase o a un programa.
2. Solo es `contactable` si existe tutor vinculado al atleta y consentimiento
   `granted` con fecha.
3. Enviar oferta crea un enrollment `pending`; esa reserva evita vender la misma
   plaza dos veces.
4. Aceptar activa la reserva y marca entrada/oferta como convertidas.
5. Expirar cancela la reserva y devuelve la entrada a `waiting`. Reintentar con
   la misma clave no duplica eventos ni transiciones.

### Familias

- Identidad (`people`), rol de tutor, contacto, permiso familiar y pagador son
  relaciones separadas.
- Un atleta puede pertenecer a más de una familia a lo largo del tiempo.
- Solo existe un pagador principal abierto por familia.
- Email y teléfono permanecen en `guardian_contacts`, sin grants Data API para
  `authenticated` y fuera de outbox/analytics.

## Autorización y aislamiento

- Todos los comandos resuelven miembro, rol y scope de sede en base de datos.
- Los managers no operan en sedes no asignadas.
- FKs compuestas rechazan trials, ofertas y reservas cross-tenant o cross-sede.
- Las tablas nuevas tienen RLS habilitado y forzado, pero permanecen sin grants
  Data API: el acceso requiere servidor autorizado.

## Fixture y evidencia

`supabase/fixtures/zaltyko_synthetic_academies.sql` contiene únicamente datos
fabricados: una organización mono-sede y otra multi-sede, tutores con dominios
`.invalid`, atletas, familias, programas, clases y sesiones.

Validaciones locales:

- `pnpm test:zaltyko-growth-foundation:local`: esquema, RLS, grants, FKs,
  consentimiento y pagador principal;
- `pnpm test:zaltyko-growth-services:local`: trial→waitlist→enrollment, conversión
  directa, oferta expirada, reintentos, scope de sede, vínculo tutor-atleta,
  carrera de entrada duplicada, conflicto de clave reutilizada, paridad
  outbox/audit y payloads sin claves sensibles.

Esto no valida API HTTP, portal de tutor, UI, comunicaciones reales, E2E
autenticado, despliegue ni producción.

## Dependencia siguiente

El ledger mínimo puede referenciar familia, pagador y enrollment sin copiar
permisos ni PII. El motor de métricas seguirá esperando a que el ledger cierre
reconciliación, pagos parciales, reintentos y refunds.
