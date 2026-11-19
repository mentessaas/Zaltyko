# Aceptación QA — mínimo de perfil staff canónico sin acceso

## Corte y estado

- Checkout: `/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-canonical-staff-core-20261105`.
- Rama/HEAD al preparar estos criterios: `codex/canonical-staff-core-20261105` / `bd022b63499749ff0dce7e8338b53b0d57f54c77`.
- Estado: contrato de aceptación preparado; **no es revisión de una implementación ni PASS**. El checkout estaba limpio y aún no había diff de Backend visible.
- Fuente principal: [`canonical-coach-profile-minimum.md`](../../../../auditorias/2026-11-05/canonical-coach-profile-minimum.md). Contrato relacionado: [`canonical-staff-minimum-contract.md`](../../../../auditorias/2026-11-05/canonical-staff-minimum-contract.md).

## Alcance y límites

Este corte cubre únicamente perfiles canónicos de staff sin acceso digital: crear `people` y `staff_profiles` en una transacción con `member_id = NULL`, editar los nombres permitidos, archivar/reactivar y conservar asociaciones e historial.

- Solo puede operar un Owner canónico activo con alcance `all`. Este contrato no extiende la administración a `admin`, `manager`, `coach` ni a Owner con alcance `selected`.
- No crea usuarios Auth, membresías, invitaciones, roles, scopes por sede ni acceso a Owner o asistencia. No modifica el resolver general de Owner.
- No usa el modelo legacy `public.coaches` ni sus rutas o pantallas.
- No cubre asignación recurrente a `class_templates`; la asignación por sesión también queda fuera de este backend mínimo.
- No guardar nombres, fechas de nacimiento, correo, teléfono ni payload personal en logs, auditoría de replay o recibos históricos. El recibo de mutación contiene solo identificadores y estado necesarios para repetir la respuesta.
- Criterios pendientes de ejecución. No se ejecutaron pruebas locales, SQL, servicios, consultas remotas ni proveedores. Este documento no incluye datos personales.

## Casos de aceptación

| # | Caso | Aceptar cuando |
|---|---|---|
| 1 | Autorización | Owner canónico activo con alcance `all` puede listar y mutar. Owner inactivo o con alcance `selected`, `admin`, `manager`, `coach`, sin membresía o de otra organización recibe denegación sin escrituras. No se añade ningún rol o permiso nuevo. |
| 2 | Aislamiento de organización | La organización se deriva de la sesión y membresía autorizadas. IDs de organización, persona o miembro suministrados por el cliente no permiten seleccionar otro tenant. Referencias cruzadas o sede inválida se rechazan sin filas parciales. |
| 3 | Alta mínima atómica | Una solicitud válida crea exactamente una fila `people` y una `staff_profiles` en la misma transacción y organización; nombres requeridos no vacíos, `member_id = NULL`, `is_active = true`. Si cualquier inserción falla, ambas se revierten. No se solicitan fecha de nacimiento ni datos de contacto. |
| 4 | Sin identidad ni concesión de acceso | Antes y después del alta no aparece usuario Auth, `organization_members`, scope, invitación o permiso nuevo. `member_id` permanece nulo y la respuesta no implica que la persona pueda iniciar sesión, abrir Owner o tomar asistencia. |
| 5 | Replay idempotente y recibo mínimo | Repetir la misma clave con el mismo hash/payload no repite la mutación y devuelve exactamente `{ receipt: { staffProfileId, version, isActive }, replayed: boolean }`. El recibo no incluye `personId`, `operationId`, nombres ni copia del payload; tampoco se guardan nombres en logs o auditoría de idempotencia. Tras una edición posterior, el replay devuelve el recibo original de la mutación; la UI hace un GET separado para mostrar el estado actual. |
| 6 | Conflicto de clave | Reutilizar la misma clave con payload distinto produce conflicto explícito y no cambia el registro ni crea filas. La respuesta no revela valores personales previos. |
| 7 | Concurrencia | Dos solicitudes simultáneas con igual clave y payload convergen en una sola persona/perfil y recibo; una respuesta indica `replayed: false` y la repetición `replayed: true`. No hay duplicados, éxito parcial ni error interno filtrado. La serialización y el registro de replay sobreviven a un reintento posterior. |
| 8 | Personas con nombres iguales | Dos altas intencionales con claves distintas no se fusionan por coincidencia de nombres. La misma fila `people` no obtiene dos perfiles de staff en la organización. Una política de resolución de duplicados, si se necesita, se diseña aparte y no compara nombres como identidad. |
| 9 | Archivo, reactivación e historial | Archivar cambia `is_active` a `false`, lo excluye del listado activo y bloquea futuras asignaciones sin borrar filas, `session_staff` ni historial. Reactivar conserva los mismos IDs y asociaciones. Las mutaciones usan CAS contra la versión esperada; un estado obsoleto se rechaza sin escrituras parciales. Cada transición queda auditable sin nombres en el recibo. |
| 10 | Edición protegida y CAS de persona | La mutación acepta solo `given_name`, `family_name` y, si el contrato lo habilita, `preferred_name`. Si la fila `people` está compartida o enlazada a otra entidad/identidad, se deniega la edición; nunca se cambia `person_id`, `member_id`, organización, rol o acceso. Para una persona no compartida, comparar CAS de versión más los `updatedAt` de `people` y `staff_profiles` a precisión de microsegundos dentro de la transacción; no truncar timestamps a milisegundos en JS. Si cualquiera cambió, responder conflicto sin mutar ninguna fila. |

## Gaps del esquema y decisiones que el backend debe demostrar

- `people` requiere `given_name` y `family_name`; `staff_profiles.member_id` es nullable y la unicidad organización/persona impide dos perfiles para la misma fila de persona. Las FK compuestas protegen la consistencia entre organizaciones. Esto soporta el perfil sin login, pero no crea una identidad.
- Las tablas de persona/perfil no guardan clave idempotente ni hash de solicitud. El backend debe demostrar un mecanismo durable ya autorizado (por ejemplo, helper/registro transaccional con clave y hash) que cubra conflicto, replay y concurrencia. La unicidad de perfil no sustituye el contrato de replay; no se propone una migración en este documento.
- El esquema no deduplica personas por nombre. Mantener personas homónimas separadas; no hacer merge automático.
- El archivo solo se representa con `is_active`; no hay `archived_at`, actor ni motivo en `staff_profiles`. Debe demostrarse cómo el historial de archivo/reactivación queda registrado en la auditoría existente, o documentar el límite sin afirmar historial completo. `session_staff` y las referencias históricas no se eliminan.
- Debe confirmarse que el esquema/servicio aporta una versión CAS y `updatedAt` de ambas filas con precisión de microsegundos; si falta, o el transporte lo redondea a milisegundos, no se acepta como control de concurrencia.
- `staff_profiles` no tiene sede. La restricción a Owner `all` es parte de este corte; no inferir acceso organizativo para roles con alcance parcial.
- `class_templates` no relaciona entrenadores. `session_staff` es por sesión, así que este criterio no acepta asignación recurrente ni propagación a sesiones futuras.
- Editar nombres modifica la fila canónica de `people`, no una copia local del perfil staff. Las personas compartidas se rechazan para edición en este corte; la política tampoco cambia `person_id` para ocultar el vínculo.

## Decisión QA y siguiente paso

Estos son los criterios para una revisión estática del freeze de Backend. La aceptación requerirá comprobar en el diff la autorización Owner-all, la transacción de alta, ausencia de concesión de acceso, idempotencia/replay sin nombres y preservación de vínculos/historial. El estado de implementación, tests y runtime queda **NO VERIFICADO** hasta revisar el freeze y la evidencia autorizada. No implementar invitaciones, cambios de esquema, roles ni asignación recurrente dentro de este alcance.
