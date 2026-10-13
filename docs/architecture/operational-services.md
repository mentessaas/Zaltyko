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

### API y espacio de gestión de grupos

- `/owner/groups` es la superficie canónica; no reutiliza rutas ni IDs de
  academia legacy. La página requiere sesión y resuelve organización, rol y
  sedes con el modelo greenfield.
- Owner, admin y manager pueden crear grupos ligados a una actividad y sede,
  consultar sus grupos y pertenencias abiertas, buscar personas registradas,
  añadirlas y pausar/reactivar/finalizar su pertenencia.
- Toda ruta API valida sesión, tenant, rol y sede en servidor. Las lecturas y
  escrituras tienen rate limit por tenant verificado; los nombres personales
  solo se exponen con acceso al grupo y no se copian al outbox ni a la auditoría.
- Los comandos derivan el actor de la sesión, usan idempotencia y permiten
  reintentar tras un fallo de red; el servicio vuelve a validar el alcance
  transaccionalmente.
- Desde el mismo formulario se puede crear una ficha mínima de atleta y
  añadirla al grupo en un único comando idempotente. Persona, atleta,
  pertenencia M:N e historial se escriben atómicamente; la operación vuelve a
  validar rol, sede y capacidad dentro de la transacción.
- El alta mínima solo pide nombre y apellidos. No crea familia, cuenta de
  acceso, enrollment, consentimiento ni cargo; esos flujos siguen separados.
  Los eventos y la auditoría guardan identificadores/scope, no nombres ni otros
  datos personales.
- Validado localmente con tests de ruta/UI y PostgreSQL efímero: replay con la
  misma clave, rechazo de conflicto, cupo lleno sin ficha huérfana y acceso
  fuera de scope. La sesión real en navegador, QA manual de teclado/lector y
  conexión del Preview a una base aislada siguen pendientes.

### Sesiones

- Materialización idempotente desde `class_templates` y su horario semanal.
- Conversión de fecha y hora con la zona horaria de la sede.
- Respeto de fechas efectivas de la plantilla y límite de 120 días por comando.
- Exclusión de duplicados por restricción y bloqueo de plantilla.
- `/owner/classes` permite al Owner, admin o manager crear actividad, sede,
  nombre, capacidad y uno o varios horarios semanales en un mismo formulario.
- Alta de `class_templates`, `class_template_weekdays` y las sesiones iniciales
  es una transacción única; replay idempotente no duplica la plantilla ni las
  sesiones. La fecha inicial no puede estar en el pasado.
- El formulario anuncia que prepara como máximo 120 días. Aún falta ampliar el
  horizonte de forma repetible o añadir un worker para clases indefinidas; no
  presentar el calendario como generado indefinidamente hasta cerrar ese corte.
- `class_template.created` evita copiar el nombre visible de clase al outbox;
  el nombre permanece solo en la tabla de dominio. La auditoría guarda metadatos
  operativos y el evento de sesiones transporta IDs, no datos personales.
- Crear una clase no crea enrollment, pertenencia de grupo, cargo ni cobro.

### API y espacio de gestión de clases

- `GET/POST /api/v1/owner/classes` y `/owner/classes` usan membresía canónica,
  rate limit por tenant y autorización transaccional de sede.
- La actividad elegida se resuelve desde los programas activos de la academia,
  incluidos programas de gimnasia y actividades complementarias; no se infiere
  una disciplina desde el nombre de la clase.
- Los campos tienen etiquetas nativas, errores anunciados y controles de al
  menos 44 px. Añadir/eliminar horarios no depende de arrastrar elementos.
- Tests focales de ruta/interfaz (7/7) y el harness PostgreSQL efímero validan
  el contrato, replay, generación de sesiones, capacidad/aislamiento existentes
  y rechazo de una sede fuera de scope.

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
migración fundacional, moneda base y migraciones de operación/historial;
verifica:

- dos organizaciones y varias sedes sin acceso cruzado;
- manager limitado a sede;
- alta y transferencia idempotentes;
- una sola reserva de la última plaza bajo concurrencia;
- pausa, reactivación implícita en transferencia y control de versión;
- fecha efectiva persistida y rechazo de transiciones futuras no programadas;
- materialización de sesiones sin duplicados;
- alta atómica de plantilla y horarios con sesiones, replay orden-independiente,
  falta de duplicados y denegación de sede fuera de alcance;
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

Vitest focal de rutas/componentes de grupos y clases pasa localmente; `pnpm
gate:auth`, `pnpm typecheck` y `pnpm lint` también pasan en este corte. Las pruebas HTTP
simulan sesión/scope, no equivalen a navegador con sesión real. La evidencia no
incluye E2E autenticado, despliegue ni entornos remotos.

## Siguiente dependencia

Conectar estos contratos a la superficie de matrícula y transiciones del
enrollment; después, mantener el horizonte de sesiones más allá de los 120 días.
Ninguna operación calcula el Academy Health Score directamente: publica hechos
y el motor analítico posterior los procesa de forma asíncrona y versionada.
