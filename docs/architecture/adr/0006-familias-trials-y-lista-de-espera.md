# ADR-0006 — Familias, trials y lista de espera

- Estado: aceptada
- Fecha: 2026-10-06
- Alcance: relaciones familiares, trial funnel y demanda no atendida

## Contexto

El Owner Dashboard necesita medir conversión de trials y demanda en lista de
espera sin convertir contactos, tutores, pagadores o notas libres en eventos
analíticos. A la vez, una plaza ofrecida no puede ignorar la misma capacidad que
protege las inscripciones ordinarias.

## Decisión

### Familias y permisos

- `people` conserva identidad; `guardians` expresa el rol de tutor y puede
  vincularse a una cuenta autenticada sin convertirlo en miembro interno.
- `guardian_contacts` aísla email y teléfono. No se copiarán estos valores a
  outbox, audit metadata, métricas o fixtures con datos reales.
- `family_guardians` separa permiso de consulta y gestión de inscripciones.
- `family_payers` es una relación explícita: ser tutor no concede permiso
  financiero por defecto.
- `family_members` relaciona familias y atletas con intervalos fechados. No se
  añadirá un `family_id` singular a `athletes`.

### Trials

- Un trial reservado crea un enrollment canónico con estado `trial`; la sesión
  concreta vive en `trials`.
- Completar o cancelar el trial cierra ese enrollment temporal.
- Convertir crea un enrollment activo nuevo con `source = trial`. Así la
  conversión es medible y no reabre historia cerrada.
- `trial_status_history` conserva la fecha efectiva; `trial_followups` usa
  canal y resultado estructurados, sin cuerpo libre ni PII.

### Lista de espera y capacidad

- Una entrada apunta exactamente a una plantilla o a un programa y conserva
  prioridad, preferencias estructuradas, tutor de contacto y estado del
  consentimiento.
- `contactable = true` solo es válido con tutor y consentimiento `granted`.
- Enviar una oferta crea un enrollment `pending` que reserva capacidad con el
  mismo lock canónico. Aceptar lo activa; expirar lo cancela y devuelve la
  entrada a `waiting`.
- Solo puede existir una oferta pendiente por entrada. Envío, aceptación y
  expiración son comandos idempotentes.

## Consecuencias

- Trial, waitlist y enrollment no compiten con contadores de capacidad
  independientes.
- La métrica de demanda puede contar entradas `waiting` y contactables sin leer
  datos de contacto.
- La futura experiencia de tutor necesitará autorización servidor específica;
  estas tablas permanecen sin grants Data API para `authenticated`.
- Una preferencia no puede ser texto libre. El contrato de aplicación limitará
  días de semana y franjas horarias.

## Evidencia y límites

- PRD, secciones 4.3, 5, 9.7, 10.2, 10.5, 16.2 y 18.
- Fixture sintético: `supabase/fixtures/zaltyko_synthetic_academies.sql`.
- El esquema y las restricciones tienen test PostgreSQL local. Los servicios y
  el journey trial→waitlist/enrollment se validan en el siguiente corte de esta
  fase.
