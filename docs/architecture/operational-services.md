# Servicios operativos transaccionales

- Estado: implementados y verificados localmente en PostgreSQL aislado
- Fecha: 2026-10-13
- Alcance: inscripciones, pertenencia a grupos, sesiones, capacidad y asistencia

## Objetivo

Esta capa convierte el esquema canónico en operaciones de negocio seguras antes
de añadir métricas o interfaz. Cada comando resuelve la autorización desde base
de datos y escribe estado de dominio, historial, outbox y auditoría dentro de
una única transacción.

## Contratos implementados

### Inscripciones

- Alta idempotente con una sola inscripción abierta por atleta y plantilla.
- Capacidad serializada mediante advisory lock estable por organización y
  plantilla. La última plaza concurrente tiene un único ganador.
- Transiciones de estado con `expectedVersion`; los comandos obsoletos fallan
  con `VERSION_CONFLICT`.
- Pausas modeladas como intervalos en `enrollment_pauses`. Reactivar, cancelar,
  completar o transferir cierra el intervalo abierto.
- `starts_on` es inclusivo y `ends_on` exclusivo en inscripciones y pausas. El
  historial conserva `effective_on`, separado de `changed_at`.
- Las transiciones futuras se rechazan hasta disponer de comandos programados;
  cambiar el estado actual por adelantado falsearía capacidad y asistencia.
- Transferencia atómica: completa la inscripción origen, crea la destino,
  conserva la pausa cuando corresponde y no emite un churn implícito.

### Pertenencia M:N a grupos

- `group_memberships` sigue siendo la relación canónica atleta↔grupo; una
  misma gimnasta puede estar en varios grupos sin duplicarse como persona.
- Alta idempotente y cambios `pending → active`, `active ↔ paused` y
  `open → ended` validan atleta, organización, grupo, rol y sede desde el
  servidor.
- Advisory lock por organización/grupo serializa el cupo y la última plaza no
  se puede reservar dos veces. Duplicados abiertos y grupos inactivos se
  rechazan.
- `group_membership_history` registra cada cambio con fecha efectiva, estado
  anterior/nuevo, actor, motivo categórico y clave idempotente. Estado,
  historial, auditoría y outbox se escriben en la misma transacción; el evento
  no copia nombre, contacto ni texto libre de la gimnasta.
- Las fechas de transición no pueden ser futuras ni anteriores al último cambio.
  La clave idempotente también fija el motivo para que un reintento distinto no
  se confunda con el comando original.
- RLS forzada de memberships e historial respeta el alcance de sede, además del
  tenant. El cliente solo puede leer; el servicio modifica el estado y añade
  historial, cuyo rol no tiene UPDATE/DELETE.
  La interfaz y el endpoint de gestión todavía no están implementados.

### Sesiones

- Materialización idempotente desde `class_templates` y su horario semanal.
- Conversión de fecha y hora con la zona horaria de la sede.
- Respeto de fechas efectivas de la plantilla y límite de 120 días por comando.
- Exclusión de duplicados por restricción y bloqueo de plantilla.

### Asistencia

- Solo acepta una inscripción compatible con organización, sede, plantilla,
  estado y vigencia de la sesión.
- Una persona con rol `coach` debe estar asignada a la sesión mediante
  `session_staff`; owner y manager mantienen su autorización administrativa.
- Una única fila por sesión e inscripción. Las correcciones quedan serializadas,
  auditadas y publicadas como nuevos eventos.

## Seguridad e idempotencia

- El servicio recibe únicamente los identificadores del actor y vuelve a
  resolver membresía, rol, estado y alcance de sede en base de datos.
- Ninguna decisión de autorización confía en roles enviados por el cliente.
- Cada comando usa una clave de idempotencia por organización y conserva su
  resultado en el outbox para responder a reintentos sin duplicar efectos.
- Los payloads de eventos se validan contra claves de PII, datos médicos y
  direcciones antes de insertarse.
- Los fixtures de integración son sintéticos y neutrales.

## Evidencia local

`pnpm test:zaltyko-operations:local` levanta PostgreSQL efímero, aplica la
migración fundacional y las migraciones de operación/historial; verifica:

- dos organizaciones y varias sedes sin acceso cruzado;
- manager limitado a sede;
- alta y transferencia idempotentes;
- una sola reserva de la última plaza bajo concurrencia;
- pausa, reactivación implícita en transferencia y control de versión;
- fecha efectiva persistida y rechazo de transiciones futuras no programadas;
- materialización de sesiones sin duplicados;
- coach no asignado rechazado y coach asignado autorizado;
- atleta en varios grupos, historial de pausa/reactivación/baja, cupo de grupo
  concurrente, idempotencia y denegación por tenant/sede en RLS;
- correcciones concurrentes de asistencia con una única fila canónica;
- paridad entre eventos outbox y entradas de auditoría;
- ausencia de claves sensibles en los payloads.

`supabase/tests/group_membership_history_rls_test.sql` añade cobertura pgTAP de
privilegios, RLS forzada, aislamiento tenant/sede e inmutabilidad del historial.
La batería pgTAP no se pudo ejecutar porque Docker no estaba activo y no había
PostgreSQL local Supabase; el harness aislado sí ejercita las políticas con
roles `anon`, `authenticated` y `service_role`.

Esta evidencia no incluye API HTTP, sesión autenticada, UI, despliegue ni
entornos remotos.

## Siguiente dependencia

PR-03 reutiliza estos contratos en `growth-operations.md`. Ninguna operación
calcula el Academy Health Score directamente: publica hechos y el motor
analítico posterior los procesa de forma asíncrona y versionada.
