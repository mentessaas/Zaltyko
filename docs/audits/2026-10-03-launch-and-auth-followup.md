# Continuación del cierre de lanzamiento — 2026-10-03

## Veredicto

**NO-GO para activar el directorio, las reclamaciones, el checkout de la tienda B2B o la autenticación Google para público general.** El código local supera el gate técnico integrado. Esto no acredita migraciones aplicadas, autenticación completa por cuenta, correo entregado, una compra real ni validación en producción.

La comprobación se hizo en el worktree aislado `codex/continue-launch-20261003`, basado en `origin/main` `0800a00f8310e35cd049d229dcd507000da9f31a`. El checkout de trabajo original, que tenía cambios ajenos sin guardar, permaneció intacto.

## Cambios locales

- `POST /api/admin/users` ahora requiere la capacidad `settings:users` además de las comprobaciones de rol y tenant que ya hacía la ruta. Evita que un rol personalizado que no tenga gestión de usuarios emita invitaciones.
- El inventario de APIs clasifica autenticación por método HTTP. Reconoce anotaciones `@route-auth GET ...` / `@route-auth POST ...` y guardas de sesión declaradas; una guarda personalizada sin motivo documentado permanece como `unknown`.
- `/api/checkout` documenta el contrato público que pretende ofrecer. El middleware lo mantiene detrás de `ENABLE_B2B_STORE`, cuyo valor por defecto es apagado.

## Hallazgos que siguen bloqueando la activación

### Google y recuperación de cuenta

La comprobación de Google Cloud/Supabase (2026-10-02) encontró el cliente OAuth Web `Zaltyko Web`, el origen y callback de Supabase correctos, el proveedor Google activo y el retorno `https://zaltyko.com/auth/callback` permitido. La autorización posterior del usuario para crear/configurar ese cliente no requería un cambio: ya existía y no se duplicó ni se leyó o rotó su secreto. La audiencia de consentimiento seguía en **External / Testing con cero testers** en la última comprobación; por eso llegar a Google no demuestra que una cuenta pública pueda terminar login o registro. Esta limitación requiere una acción en Google Auth Platform y una prueba con una cuenta autorizada. No se cambió Google Cloud ni Supabase en esta entrega. [Restricciones de la audiencia de prueba de Google](https://support.google.com/cloud/answer/15549945?hl=en).

El enlace de recuperación está presente y `/auth/forgot-password` respondió 200 en la verificación anterior. Supabase Auth seguía usando su servicio de correo integrado, por lo que no hay prueba de entrega real ni de restablecimiento recibido por correo. Evidencia y límites: [guía OAuth y recuperación](../auth/google-and-password-recovery.md).

### Directorio y onboarding

El guard de onboarding que impide duplicar academias operativas está integrado en `main` (#184). La consulta de producción del 2026-10-03 encontró **cero tablas `directory_*`**; la sandbox E2E sí tiene 11. Por tanto, la búsqueda pública y las reclamaciones del directorio no están preparadas para activarse en producción. No se ejecutó un runner ni se habilitaron flags. La conciliación de historiales y la comprobación de backup/restauración siguen siendo previas obligatorias.

El objetivo de 60 academias y 30 eventos es una meta de preparación, no evidencia de fichas revisadas. No se publicaron datos ni se autorizaron condiciones de reutilización de las fuentes en esta pasada.

### Suscripción anual

La lectura de producción del 2026-10-03 confirma que `plans` tiene configuración anual para Starter y Growth: 190 €/año y 490 €/año, con referencias de precio mensuales y anuales presentes. El historial nativo de Supabase registra `add_annual_plan_prices` como `20260929100621`, mientras que el archivo local se llama `20260929120000_add_annual_plan_prices.sql`; el ledger aplicacional sigue en 54 filas, hasta `20260913100000`. **No volver a ejecutar esa migración** hasta conciliar ambos historiales. La presencia de referencias en la base no verifica que los objetos Stripe sigan activos ni que el Checkout productivo funcione: la conexión de Stripe devolvió `UNAUTHORIZED` y requiere reautenticación. Stripe Tax y activación live siguen aplazados por decisión del usuario. Ver [auditoría de suscripción anual](ANNUAL-SUBSCRIPTION-IMPLEMENTATION-2026-09-29.md).

### Estado de Supabase y seguridad

La producción usa PostgreSQL 17.6 y no tiene ramas de desarrollo; la sandbox E2E es un proyecto activo separado, no una rama ni una copia staging de producción. En producción, RLS está habilitado y no hay policies en tres tablas internas (`__drizzle_migrations`, `lead_interactions`, `zaltyko_schema_migrations`); el asesor de Supabase también advierte que la protección contra contraseñas filtradas está deshabilitada. La ausencia de policies deniega por defecto el acceso sujeto a RLS, pero deja el hardening explícito pendiente. No se aplicaron migraciones remotas por la divergencia de historiales. [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

La organización está en Free con dos proyectos activos (producción y sandbox); `Pawsgrip-Crm` aparece inactivo. La lista no muestra staging ni ramas de producción. Los respaldos cloud siguen aplazados según la decisión anterior; borrar el proyecto inactivo no libera un cupo activo. [Límites de facturación de Supabase](https://supabase.com/docs/guides/platform/billing-faq).

### Checkout de la tienda B2B

La bandera mantiene el checkout inactivo. La revisión del código encontró que, si se habilitara, crea `line_items` con `unit_amount: 0`, usa a la vez el contexto de cuenta conectada y `transfer_data.destination`, forma URLs de éxito/cancelación desde el header `Origin`, y descuenta existencias al crear la venta pendiente. No apareció un consumidor del webhook que llame a `markSalePaid` para ventas de la tienda. La ruta no debe habilitarse hasta implementar importes de producto validados en servidor, un modelo Connect coherente, URL de retorno confiable, liberación idempotente de stock y liquidación/conciliación por webhook, con pruebas de test mode.

## Verificación local

`pnpm verify:production` finalizó con código 0:

- Inventario API estricto: 367 rutas, 249 mutantes, cero mutantes `unknown` y cero riesgos semánticos estáticos.
- Cobertura RLS de fuentes SQL: 79/79 tablas con tenant.
- Contrato de entorno: 70 variables documentadas, sin inspeccionar valores.
- Auditoría de dependencias de producción: sin vulnerabilidades conocidas.
- Integridad de migraciones: 7 Drizzle y 94 migraciones Supabase validadas en archivos.
- TypeScript y ESLint: PASS.
- Vitest: 435 archivos PASS, 1 omitido; 2.237 pruebas PASS, 3 omitidas.
- Build: PASS, 274/274 páginas generadas.

El build aislado registró que no tenía `STRIPE_SECRET_KEY`, `DATABASE_URL_POOL`/`DATABASE_URL` ni `SUPABASE_SERVICE_ROLE_KEY`; solo se vieron nombres de variables, no valores. Esas advertencias no validan ni invalidan el entorno de producción. El inventario API y la cobertura RLS son análisis estáticos; no sustituyen pruebas E2E autenticadas, acceso negativo desde Supabase ni restauración real.

## Sin ejecutar en esta entrega

No hubo cambios en Google Cloud, Supabase, Stripe ni Vercel; no se leyó ni modificó ningún secreto, no se aplicaron migraciones remotas, no se enviaron correos ni cobros y no se desplegó. La conexión de Stripe necesita reautenticación para verificar Prices y Checkout. Tampoco se ejecutó la prueba manual de VoiceOver. Continúan pendientes la revisión independiente/CI del PR #188 y la validación E2E de las cuentas y flujos que Google mantiene limitados a testers.
