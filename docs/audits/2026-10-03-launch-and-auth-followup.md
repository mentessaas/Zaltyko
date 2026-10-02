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

La última comprobación de Google Cloud/Supabase (2026-10-02) encontró el cliente OAuth Web `Zaltyko Web`, el origen y callback de Supabase correctos, el proveedor Google activo y el retorno `https://zaltyko.com/auth/callback` permitido. No hace falta crear otro cliente ni leer o rotar su secreto. El estado de consentimiento de Google seguía en **External / Testing con cero testers**; por eso que la pantalla de Google cargue no prueba que una cuenta real termine el alta. En esta pasada no se cambió Google Cloud ni Supabase.

El enlace de recuperación está presente y `/auth/forgot-password` respondió 200 en la verificación anterior. Supabase Auth seguía usando su servicio de correo integrado, por lo que no hay prueba de entrega real ni de restablecimiento recibido por correo. Evidencia y límites: [guía OAuth y recuperación](../auth/google-and-password-recovery.md).

### Directorio y onboarding

El guard de onboarding que impide duplicar academias operativas está integrado en `main` (#184). El flujo de búsqueda/reclamación de fichas del directorio está en el código, pero la auditoría de producción del 2026-10-02 encontró ausentes las tablas y flags `DIRECTORY_*`. Los historiales nativo y aplicacional de migraciones discrepan; no se ejecutó un runner ni se habilitaron flags. Antes hay que conciliar ambos historiales y comprobar backup/restauración.

El objetivo de 60 academias y 30 eventos es una meta de preparación, no evidencia de fichas revisadas. No se publicaron datos ni se autorizaron condiciones de reutilización de las fuentes en esta pasada.

### Suscripción anual

La implementación anual para Starter y Growth y los Prices/Sessions de prueba se documentaron el 2026-09-29. Eso verifica el flujo de test, no su disponibilidad productiva. La migración `20260929120000_add_annual_plan_prices.sql` y los Prices anuales de producción no se aplicaron/asociaron según la última revisión; la conciliación del historial productivo sigue siendo previa obligatoria. Stripe Tax y activación live continúan fuera de preparación hasta resolver la situación fiscal. Ver [auditoría de suscripción anual](ANNUAL-SUBSCRIPTION-IMPLEMENTATION-2026-09-29.md).

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

No hubo cambios en Google Cloud, Supabase, Stripe ni Vercel; no se leyó ni modificó ningún secreto, no se aplicaron migraciones remotas, no se enviaron correos ni cobros y no se desplegó. Tampoco se ejecutó la prueba manual de VoiceOver. Continúan pendientes la revisión independiente/CI de los PR abiertos y la validación E2E de los roles y flujos reales.
