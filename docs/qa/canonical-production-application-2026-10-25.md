# Instalación canónica productiva autorizada — 25 octubre 2026 UTC

## Hallazgos

Aplicación única confirmada por Supabase en `jegxfahsvugilbthbked`.
Migración nativa registrada: `20261025222531_canonical_domain_installation_candidate`.
Observación posterior: 2026-10-25T22:25:50.700515Z (23:25 de Madrid).

El humano autorizó exclusivamente el archivo y destino mediante la respuesta
«Sí, autorizar solo ese archivo y destino». Se revalidaron identidad, versión,
roles, ausencia de ambos esquemas y disponibilidad de la extensión antes de escribir.

Archivo: `docs/deployment/candidates/20261025202902_canonical_domain_installation_candidate.sql`.
SHA-256: `00ead5a3869bb335f2f17e58ebaaacac2bdc1ae4504493b473c68393359dab00`.
394249 bytes, sin edición. Su cabecera histórica applyReady=false no se modificó:
la autorización y ejecución se acreditan aquí, fuera del archivo aprobado.

Ejecución por MCP apply_migration, proyecto fijo comprobado con get_project:
Zaltyko, ACTIVE_HEALTHY, eu-north-1, db.jegxfahsvugilbthbked.supabase.co,
PostgreSQL17.6. El cuerpo exacto BEGIN…COMMIT se transmitió íntegro. Envoltorio
de sesión externo: SET app.canonical_installation_mode =
'production-reviewed-20261025202902'; SET
app.canonical_installation_target_project_ref = 'jegxfahsvugilbthbked';
RESET de ambas variables después. Ninguna modificación del cuerpo aprobado.
La versión nativa refleja la aplicación real, no el timestamp de generación CLI.
No se reconstruyeron entradas antiguas ni se tocó el ledger de aplicación.

## Verificación remota posterior

- btree_gist1.7 instalada en extensions; ambos esquemas canónicos propiedad postgres.
- 92 tablas, todas con RLS habilitada y forzada; 64 políticas.
- 16 rutinas, cuatro SECURITY DEFINER; propietario/search_path correctos en las16.
- 61 enums con ACL esperada; 17 triggers.
- Catálogo:330 índices (incluidos los de constraints),852 constraints:
  365 check,263 FK,92 PK,130 unique,1 exclusion y1 constraint trigger.
  El manifiesto AST enumera851 constraints más el constraint trigger por separado,
  y107 CREATE INDEX explícitos; esos conteos no equivalen al total del catálogo.
- Cero privilegios de tabla para PUBLIC/anon o roles ajenos a la allowlist.
  EXECUTE corresponde exactamente a los dos helpers para authenticated/service_role
  y los dos guard triggers para PUBLIC previstos en el candidato.
- Defaults únicamente de postgres en zaltyko: tablas y secuencias para service_role;
  cero defaults globales postgres/supabase_admin relevantes.
- Las92 tablas nuevas están vacías (EXISTS por tabla, sin extraer datos).
  Ledger e2e_schema_migrations ausente.
- public conserva139 tablas. Tres digests de metadatos public/zaltyko_private
  coinciden exactamente antes y después:
  esquemas `0d7b3448c04b437dddb8547fead631fb`;
  relaciones `bc76f12ee3ef70b79cf356ab2e7dbc61`;
  rutinas `71ee5356a4c746a8153aaab6bac03459`.
  Son controles de catálogo, no hashes completos de filas ni prueba de ausencia
  de cualquier cambio externo concurrente.
- Ledger nativo:53 entradas anteriores más esta nueva,54 en total.
- Advisor:30 INFO de RLS sin políticas, coherentes con denegación por defecto de
  esas tablas del candidato; ninguna corrección automática. Persiste el WARN
  anterior de protección de contraseñas filtradas desactivada. No se cambió Auth.

## Fuente

Supabase MCP get_project, execute_sql READ ONLY/ROLLBACK, apply_migration
(success=true), list_migrations y get_advisors; respuestas sin secretos en
`canonical-production-application-evidence-2026-10-25.json`.
Ensayo previo aislado: CI40232300015, archivo exacto y aislamiento/ACL/replay.
No se repitió ese ensayo ni se insertaron fixtures en producción.

## Importancia

Se cerró la instalación SQL expresamente autorizada. No acredita todavía la
operativa autenticada productiva ni Stripe Live, datos/configuración iniciales,
correo de la entrega o publicación de la aplicación. Los esquemas están vacíos.

## Siguiente paso

Continuar los gates independientes de Auth sandbox y revisión externa de PR234.
La autorización de este archivo no aprueba SQL adicional ni cambios de proveedor.
Sin builds/pruebas/servicios locales, despliegues ni efectos Stripe en esta ronda.
Preview y recursos del ensayo no se modificaron.

