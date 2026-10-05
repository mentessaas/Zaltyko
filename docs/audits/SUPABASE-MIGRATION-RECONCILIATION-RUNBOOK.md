# Runbook de reconciliación Supabase — trials y ownership de leads

Fecha: 15 de septiembre de 2026

## Estado verificado

`supabase migration list --linked` confirma divergencia bidireccional: hay
migraciones locales ausentes en remoto y migraciones remotas ausentes en el
checkout. La lectura directa del ledger remoto muestra que su última versión es
`20260911031638`; el checkout contiene además migraciones posteriores y dos
archivos `0009` históricos. El `supabase db push --linked --dry-run` se detiene
antes de proponer escrituras. Por eso no se debe usar `db push`, `db pull` ni
`migration repair` como comando rutinario sobre producción.

## Procedimiento aprobado

1. Crear un backup verificable y registrar el identificador de la ventana.
2. Clonar la base en staging; nunca usar `/private/tmp` como sustituto del
   entorno persistente.
3. Ejecutar `supabase migration list --linked` y guardar la salida.
4. Comparar cada migración remota ausente localmente con `supabase db pull` en
   una rama de reconciliación. No marcar versiones como `reverted` sin revisar
   previamente su SQL y los objetos que creó.
5. Ejecutar `supabase db push --linked --dry-run` hasta que el plan contenga
   únicamente migraciones revisadas, incluyendo `20260915140000` y
   `20260915150000`.
6. Aplicar primero en staging; verificar tablas, constraints, índices, RLS y
   lecturas/escrituras idempotentes de `lead_trials`.
7. Ejecutar el E2E autenticado lead → trial → outcome → atleta en staging.
8. Solo con evidencia PASS, repetir la misma secuencia en producción con
   monitorización y rollback documentado.

## Rollback funcional

Las dos migraciones nuevas son aditivas. Si la ventana falla, desactivar la UI
de trials y volver a la ruta legacy compatible; no borrar columnas ni tablas
sin un plan de retención y revisión de datos.

## Registro de aplicación controlada — 16/09/2026

Por autorización explícita se ejecutaron mediante `supabase db query --linked --file` las migraciones aditivas `20260915100000_trial_lead_link.sql`, `20260915140000_lead_trials.sql` y `20260915150000_lead_ownership.sql`. La verificación confirmó tablas de trials/outcomes, ownership en `leads`, RLS, políticas de tenant e índices. El ledger histórico sigue divergente; no se ejecutó `migration repair` ni se alteraron migraciones antiguas. Reconciliar el ledger requiere una ventana controlada con backup y staging.

## Registro de preparación controlada del directorio — 05/10/2026

- La copia cifrada PostgreSQL + Storage fechada `2026-10-04` está en la carpeta privada de Drive. Su README existente registra restauración de ensayo y coincidencia de 159 tablas. Esta restauración no se repitió en la ventana del 05/10. La clave de recuperación permanece en el llavero del Mac; el acceso desde otro dispositivo no se ha probado.
- En `Zaltyko E2E Sandbox` se aplicó primero el bloque de 60 índices de `20260929223000_harden_internal_tables_and_fk_indexes.sql`; Advisor dejó de emitir `unindexed_foreign_keys` (versión nativa de sandbox `20261005002950`). Las políticas de las tablas internas y la prueba RLS del directorio ya estaban cubiertas allí.
- En producción se aplicaron mediante Supabase MCP los SQL ya versionados del repositorio, en este orden: `20261005003207_harden_internal_tables_and_fk_indexes`, `20261005003208_internal_table_explicit_deny_policies`, `20261005003210_drizzle_migrations_explicit_deny_policy`, `20261005003633_public_directory_20260930` y `20261005003634_directory_explicit_deny_policies_20261002`.
- Resultado verificado: 60 índices FK presentes; advisor sin `unindexed_foreign_keys` y sin tablas RLS habilitadas sin policy. El directorio tiene 11 tablas; las diez tablas privadas no conceden `SELECT` a `anon`/`authenticated` y tienen denegación explícita; `directory_entries` solo expone filas publicadas, no fusionadas y sin vínculo operativo. Hay cero entradas y el bucket `directory-evidence` está privado. El endpoint de catálogo sigue `503 DISABLED` y no se activaron flags.
- **Ledger no reconciliado:** el historial nativo recibió las versiones anteriores, pero el ledger de aplicación `public.zaltyko_schema_migrations` continúa en 54 filas hasta `20260913100000`. Mantener deshabilitados `supabase db push` y `pnpm db:migrate:ledger --apply`; no volver a ejecutar esas migraciones hasta comparar checksums, nombres y objetos entre el repo, `supabase_migrations.schema_migrations` y el ledger aplicacional.
- Los cambios de esta ventana fueron aditivos y no modificaron filas de academias, facturación, cuentas ni cobros. Esta anotación registra la preparación del esquema; **no** es autorización para abrir el catálogo, cargar calendarios ni activar reclamaciones. Esos pasos siguen condicionados a la reconciliación, fuentes autorizadas y E2E de lanzamiento.

### Actualización de despliegue — 05/10/2026

Se configuró `DIRECTORY_ADMIN_ENABLED=true` únicamente en el entorno Production de Vercel para habilitar el panel interno de Super Admin cuando se genere el siguiente despliegue. El despliegue actual todavía no incorpora este cambio de entorno. No se configuraron los flags de catálogo público, reclamaciones, importaciones ni comunicaciones; la API pública continúa cerrada. Esta apertura administrativa no resuelve la divergencia de ledgers ni autoriza publicar o importar contenido.
