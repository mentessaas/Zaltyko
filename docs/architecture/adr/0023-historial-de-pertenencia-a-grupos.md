# ADR-0023 — Historial temporal de pertenencia a grupos

- Estado: aceptada
- Fecha: 2026-10-13
- Alcance: grupos, capacidad, privacidad y métricas operativas

## Contexto

`group_memberships` conserva correctamente la relación M:N atleta↔grupo y el
estado actual, pero no permite reconstruir pausas, reactivaciones ni quién hizo
cada cambio. El `audit_log` genérico sirve para trazabilidad, pero no debe ser
la fuente de verdad que reconstruya periodos operativos o métricas.

## Decisión

- Mantener `group_memberships` como relación canónica y proyección del estado
  vigente; no añadir `group_id` a `athletes` ni usar `enrollments` como
  sustituto.
- Añadir `group_membership_history`, append-only, con estado anterior/nuevo,
  fecha efectiva, actor miembro, motivo categórico e idempotency key por
  organización; no almacenar texto libre en el motivo.
- Crear o cambiar el estado, insertar historial, audit log y outbox dentro de
  una sola transacción. Los reintentos devuelven el resultado ya aplicado y
  una clave reutilizada con otros datos, incluido el motivo, falla. La fecha
  efectiva no puede preceder al último cambio registrado.
- Serializar altas por grupo para no exceder su capacidad; rechazar duplicados
  abiertos y validar organización, sede, rol y estado de la gimnasta en el
  servidor.
- RLS directo sigue tanto organización como alcance de sede. La historia no
  contiene nombres, contacto, fecha de nacimiento ni otros datos personales;
  outbox solo transporta identificadores opacos y estado.
- El historial solo admite lectura autorizada y altas desde el servidor; no
  concede UPDATE/DELETE a clientes ni a `service_role`. La eliminación en
  cascada queda reservada a la purga de la pertenencia o academia completa.
- Hasta que exista scheduler, rechazar cambios con fecha efectiva futura.

## Consecuencias

La aplicación puede reconstruir la pertenencia temporal sin inferirla desde la
clase recurrente. El esquema y las pruebas se ejecutan solo sobre PostgreSQL
efímero; no se ha aplicado la nueva migración a Supabase remoto ni existe todavía
una API/UI de gestión de grupos.

## Evidencia

- ADR-0002 conserva la separación entre pertenencia M:N, inscripción, plantilla
  y sesión.
- `scripts/run-zaltyko-operational-services-local.sh` prueba multigrupo,
  idempotencia, capacidad concurrente, cambios de estado, autorización por sede,
  historial y RLS con fixtures sintéticos.
- `supabase/tests/group_membership_history_rls_test.sql` cubre los mismos
  límites tenant/sede y privilegios con pgTAP; la ejecución CLI queda pendiente
  porque el daemon Docker local no estaba activo.
