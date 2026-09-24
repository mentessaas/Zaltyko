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
