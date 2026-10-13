# ADR-0021 — Aislamiento de helpers del dominio nuevo

- Estado: aceptada para implementación local
- Fecha: 2026-10-13
- Alcance: migraciones greenfield y autorización SQL

## Contexto

Producción y el sandbox E2E ya contienen `zaltyko_private` con helpers
`SECURITY DEFINER` de la arquitectura anterior. La consulta de solo lectura del
13 de octubre confirmó `USAGE` de ese esquema para `anon`, `authenticated` y
`service_role` en ambos proyectos. La migración fundacional greenfield revocaba
permisos en bloque y cambiaba el comentario del mismo esquema. Aunque sus nuevos
helpers tienen otros nombres, ese cambio podía alterar el acceso de las rutas y
políticas heredadas. La migración histórica que creó los helpers ya consta en
ambos historiales; no se reescribe.

## Decisión

1. Crear `zaltyko_domain_private` para las funciones `SECURITY DEFINER` del
   dominio greenfield y hacer que sus políticas, triggers y migraciones lo usen.
2. Dar `USAGE` y `EXECUTE` solo a `authenticated` y `service_role`; revocar el
   acceso heredado de `PUBLIC` y `anon`. Las funciones mantienen
   `search_path = ''`, cualifican los objetos y validan la identidad y la
   pertenencia a la organización.
3. No cambiar definición, grants ni comentarios de `zaltyko_private` en el
   código greenfield. El retiro o traslado de helpers antiguos requiere un
   cutover separado y verificado.
4. Mantener intactos los archivos históricos ya aplicados. Los SQL greenfield
   modificados aún no aparecen en los historiales remotos.

## Consecuencias

- Se evita que el despliegue nuevo reconfigure permisos de la capa vieja; las
  dos fronteras pueden coexistir durante la transición sin dual-write.
- El nuevo esquema no queda expuesto a `anon`; `authenticated` solo ejecuta los
  helpers de autorización necesarios para RLS.
- La relación M:N `group_memberships` y las claves tenant-aware no cambian.
- La validación local incluye un esquema legacy sintético con comentario,
  grants y una función centinela. No se inspeccionan ni usan datos personales.

## Validación y límites

- PostgreSQL efímero: cadena canónica de 14 migraciones y pruebas SQL: PASS.
- RLS: 79/79 tablas; integridad: 7 migraciones Drizzle + 108 Supabase: PASS.
- No se aplicó SQL a producción ni al sandbox y no se creó una rama/proyecto.
- El E2E autenticado, cutover, backup/restore y despliegue siguen pendientes.
