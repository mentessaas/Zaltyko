# Candidato SQL exacto — instalación aislada comprobada

## Hallazgos

CI [40232012970](https://github.com/mentessaas/Zaltyko/actions/runs/40232012970)
terminó SUCCESS el 25 de octubre de 2026 a las 20:42:57 UTC, sobre
`e9d9e996efdc6ac131b99df1f59ea162fa0747d5`. Generó y ejecutó el mismo
archivo candidato en PostgreSQL 17.6 desechable remoto. No hubo ejecución SQL,
build, instalación de dependencias ni servicio local en el Mac.

Archivo de revisión, fuera del historial aplicable:
`docs/deployment/candidates/20261025202902_canonical_domain_installation_candidate.sql`.
Tamaño: 394249 bytes. SHA-256:
`00ead5a3869bb335f2f17e58ebaaacac2bdc1ae4504493b473c68393359dab00`.
Se copió sin edición desde el artefacto remoto y se volvió a comprobar su hash.
El manifiesto completo descargado tiene SHA-256
`9109b3a324bad664fddba9ab05946509c984a73aa7b05be3d40223547c39976a`.

Comprobaciones remotas:

- Sin marcador explícito, rechazo antes de DDL y sin objetos parciales.
- Instalación persistida únicamente en la base desechable nombrada; el rol
  instalador `postgres` no era superusuario ni miembro de `supabase_admin`.
  Conservaba BYPASSRLS/CREATEDB/CREATEROLE y permisos sintéticos declarados.
- `btree_gist` 1.7, 92 tablas con RLS forzada, 64 policies, 16 rutinas,
  propietarios, ACL/defaults y los controles de inventario del runner.
- Fixture sintética de dos academias y tres sedes: lecturas/denegaciones,
  ausencia de escrituras parciales y rollback de la fixture.
- Segundo intento del archivo exacto rechazado por esquemas existentes;
  comprobaciones repetidas sobre el estado conservado, sin reinstalar.
- Canarios public/legacy preservados. El paquete de revisión inerte anterior
  siguió abortando incondicionalmente. Los tres SQL anteriores conservaron
  sus hashes publicados.

El primer intento `40231768504` falló antes de SQL por una comparación textual
del comprobador: buscaba CREATE SCHEMA sin las comillas del generador. Se
corrigió la comparación, conservando el candidato y los guards; no se retiró
ninguna validación para obtener el resultado posterior.

## Fuente

Generador AST fijado, snapshot sandbox
`fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36`
y manifiesto de CI. Copia durable de los cinco artefactos en
`documentacion/Zaltyko/auditoria-2026-10-25/canonical-migration-candidate-e9d9e996/`.
La procedencia CLI del nombre figura en candidates/README.md. Esto es DDL
nuevo seleccionado de un snapshot, no recuperación del historial migratorio.

## Importancia

La prueba acredita instalación y controles sobre PostgreSQL sintético, con
Auth representado por stand-ins. No acredita Supabase Auth/PostgREST reales,
un usuario servidor productivo distinto, datos legacy migrados, Stripe Live
ni publicación pública. La propiedad interna de la extensión trusted depende
del bootstrap; no se afirma equivalencia con todos los objetos de producción.

El candidato declara `applyReady=false` y `approvedForProduction=false`.
Los marcadores GUC no verifican identidad de conexión ni dan autorización.
No se ejecutó el archivo contra sandbox alojado ni producción.

## Siguiente paso

Revisión independiente del archivo/hash. Cualquier aplicación requerirá
autorización humana separada sobre este diff, destino y extensión; un runner
deberá verificar por separado la identidad de conexión y revalidar el catálogo
inmediatamente antes de la operación. Si el catálogo cambia, detener y revisar
un diff nuevo. No colocar este archivo en migraciones aplicables por inferencia.
