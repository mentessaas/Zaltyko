# Servicios operativos transaccionales

- Estado: implementados y verificados localmente en PostgreSQL aislado
- Fecha: 2026-10-06
- Alcance: inscripciones, sesiones, capacidad y asistencia

## Objetivo

Esta capa convierte el esquema canónico en operaciones de negocio seguras antes
de añadir APIs, métricas o interfaz. Cada comando resuelve la autorización desde
base de datos y escribe estado de dominio, historial, outbox y auditoría dentro
de una única transacción.

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
migración fundacional y verifica:

- dos organizaciones y varias sedes sin acceso cruzado;
- manager limitado a sede;
- alta y transferencia idempotentes;
- una sola reserva de la última plaza bajo concurrencia;
- pausa, reactivación implícita en transferencia y control de versión;
- fecha efectiva persistida y rechazo de transiciones futuras no programadas;
- materialización de sesiones sin duplicados;
- coach no asignado rechazado y coach asignado autorizado;
- correcciones concurrentes de asistencia con una única fila canónica;
- paridad entre eventos outbox y entradas de auditoría;
- ausencia de claves sensibles en los payloads.

Esta evidencia no incluye API HTTP, sesión autenticada, UI, despliegue ni
entornos remotos.

## Siguiente dependencia

La PR-03 puede reutilizar estos contratos para trials y waitlist. No debe
calcular el Academy Health Score directamente desde comandos operativos: esos
comandos publican hechos y el motor analítico posterior los procesa de forma
asíncrona y versionada.
