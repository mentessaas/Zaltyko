---
status: active
owner: producto/tech
last_reviewed: 2026-06-24
source:
  - ../../AGENTS.md
  - ../00-Inicio/Guia de trabajo para agentes.md
  - ./Backlog priorizado.md
  - ./Decisiones.md
---
# Cierre operativo pendientes agente - 2026-06-24

Esta nota organiza lo que debe revisarse antes de commitear/aplicar el bloque actual. No sustituye `git diff`; es una guia para no mezclar trabajo accidental con cambios de producto.

## Bloques que deben ir juntos

### Coherencia pricing v3.0, portal y guia canonica

Incluir juntos:

- Catalogo/limites/copy/tests de pricing v3.0.
- Desbloqueo limitado de portal `parent`/`athlete`.
- Eliminacion del artefacto compilado `src/app/app/[academyId]/my-dashboard/page.js`.
- [[Guia de trabajo para agentes]], [[Pricing]], [[Mensajes aprobados]], [[Decisiones]], [[Backlog priorizado]], [[Changelog interno]].

No separar pricing de sus tests y vault: si cambia `src/lib/plans/catalog.ts`, tambien deben ir tests y notas canonicas.

### Identidad global, vinculos y solicitudes

Incluir juntos:

- APIs/UI de `academy-memberships`, `link-requests`, paneles de solicitudes y desvinculacion.
- Schema `academy-link-requests`.
- Tests `academy-memberships-api`, `link-requests-api` y smoke UI relacionados.
- Migraciones de provider/profile role y link requests.

No marcar QA manual como cerrado hasta probar con dos cuentas reales.

### Migraciones

Orden requerido:

1. `20260623100000_add_provider_profile_role.sql`
2. `20260623103000_create_academy_link_requests.sql`
3. `20260624000000_rls_academy_link_requests.sql`
4. `20260625000000_apply_pending_migrations.sql`

`20260625000000_apply_pending_migrations.sql` no debe insertar hashes sinteticos en `__drizzle_migrations`.

### Legacy `/dashboard/*`

Opcion A ejecutada en lo automatizable:

- Mantener compatibilidad legacy.
- Evitar nuevos enlaces publicos directos a rutas legacy cuando exista contexto de academia.
- Corregir `/dashboard/classes/calendar` para no encadenar a `/dashboard/calendar`.
- Notificaciones de mensajes usan `/app/{academyId}/messages` cuando la conversacion tiene academia.

Mantener como globales por ahora: `/dashboard/profile`, `/dashboard/users`, `/dashboard/academies`, marketplace/empleo personales y otras rutas sin equivalente tenant claro.

## Revisar antes de commit

- `.obsidian/*`: normalmente no incluir salvo que se quiera versionar estado de workspace.
- `test-results/.last-run.json`: artefacto local; no incluir.
- `.playwright-cli/`: artefacto/herramienta local; no incluir salvo razon explicita.
- `.claude-progress.md`: revisar si es nota personal de agente; no incluir por defecto.
- `README 2.md`: revisar duplicado; no incluir sin decidir destino.
- `.github/workflows/deploy.yml`: incluir solo si forma parte del bloque CI/deploy ya revisado.
- Scripts nuevos bajo `scripts/`: incluir solo si estan usados por package scripts o runbooks.

## QA manual pendiente

No automatizable desde repo sin cuentas reales.

1. Owner real entra a Zaltyko y crea/selecciona academia.
2. Owner crea solicitud o invitacion a un email real de parent.
3. Parent acepta desde su cuenta.
4. Parent entra a `/app/{academyId}/my-dashboard`.
5. Parent puede abrir `/messages` y `/notifications`.
6. Parent no puede abrir `/athletes`, `/billing`, `/settings`, `/reports`.
7. Repetir con usuario `athlete` si aplica.
8. Desvincular parent/athlete y confirmar que conserva cuenta global pero pierde acceso a academia.
9. Registrar resultado en [[Backlog priorizado]] o nueva nota QA.

## Stripe v3.0 pendiente

No marcar como cerrado sin credenciales/productos reales.

1. Crear/confirmar productos Stripe:
   - Starter 19 €/mes.
   - Growth 49 €/mes.
2. Confirmar price IDs por entorno y cargarlos en env/DB.
3. Ejecutar sync si aplica (`pnpm stripe:sync`) sin imprimir secretos.
4. Probar checkout Starter y Growth.
5. Probar webhook de suscripcion activa.
6. Probar upgrade/downgrade/cancel/past_due.
7. Confirmar que Network 99 €/mes queda como CTA comercial sin checkout autoservicio.
8. Actualizar [[Registro de riesgos]] cuando Stripe real quede validado.

## Checks de cierre esperados

- `pnpm typecheck`
- `pnpm lint`
- Vitest focal de roles, link requests, memberships y go-live readiness.
- `pnpm check:migrations`
- `pnpm build`

Si un test sigue excluido por configuracion, debe existir cobertura equivalente en un test incluido.

## Produccion migrada - 2026-06-24

Entorno aplicado: Supabase `jegxfahsvugilbthbked`.

Aplicado en produccion:

- `20260622153000_add_sport_config_rls.sql`
- `20260624000000_rls_academy_link_requests.sql`

Verificado en produccion:

- `academy_sport_configs`, `athlete_sport_configs` y `coach_sport_configs` tienen RLS activo.
- `academy_link_requests` existe y tiene policies `academy_link_requests_tenant_or_target_access` y `academy_link_requests_target_response`.
- Provider role, billing invoices, tablas leak-profitability, RLS lateral, policies publicas endurecidas y tablas criticas de eventos/documentos existen o estan aplicadas.

Correccion aplicada antes de migrar:

- `get_current_profile()` devuelve un row de `profiles`, no un uuid. Las policies de `academy_link_requests` deben comparar contra `(get_current_profile()).id`.

No aplicado:

- No se hizo `git push`.
- No se tocaron productos/price IDs reales de Stripe.
- No se marco QA manual con usuarios reales como cerrado.
