# Auditoría de seguridad

## Resumen ejecutivo

El aislamiento entre tenants está ampliamente instrumentado y el auditor estático no detecta rutas sin categoría de auth. AUTH-001/ROLE-001/MT-001 y la deuda de harness ROLE-003 están cerrados en el alcance automatizado. Día 2 + Día 3 pasan en PostgreSQL local aislado y fueron promovidos por ledger el 2026-07-21. El release sigue **no-go para producción** por los controles externos de antimalware, alertas gestionadas y la entrega firmada end-to-end todavía no observada.

## Superficies revisadas

- Sesión/cookies/bearer, route wrappers, permisos, RLS y accesos browser.
- Headers/CSP, secretos/env, TLS DB, rate limiting, uploads, cron, webhooks y logs.
- Migraciones/ledger, CI/build, dependencias y advisories oficiales.
- 293 handlers: auditor estricto sin rutas `risky`, pero con limitación semántica documentada.

## Correcciones posteriores — 2026-07-21

- `SEC-006` quedó mitigado en código con `src/lib/uploads/file-security.ts`: allowlist centralizada, magic bytes, límites por tipo y rutas aleatorias. Bucket privado y antimalware siguen requiriendo configuración externa.
- `SEC-007` quedó instrumentado en CI con `pnpm audit:dependencies --prod` y artifact CycloneDX; el advisory de `protobufjs` está resuelto en el lockfile.

## Dependencias y advisories

Next.js está en 15.5.19, por encima de los parches 15.5.18 para [GHSA-26hh-7cqf-hhc6](https://github.com/vercel/next.js/security/advisories/GHSA-26hh-7cqf-hhc6), 15.5.16 para [GHSA-267c-6grr-h53f](https://github.com/vercel/next.js/security/advisories/GHSA-267c-6grr-h53f) y 15.5.13 para [GHSA-ggv3-7p47-pfv8](https://github.com/vercel/next.js/security/advisories/GHSA-ggv3-7p47-pfv8). `pnpm audit --audit-level high --prod` pasa sin vulnerabilidades altas o críticas; el escaneo completo aún reporta una baja y una moderada transitivas.

Las recomendaciones RLS se contrastaron con la [guía oficial de Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) y la [guía de seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api).

## Hallazgos

### Cierre externo 2026-07-21

- Supabase Storage: el bucket `uploads` responde `public=false`, límite 52,428,800 bytes y allowlist de imagen/vídeo. No existe scanner antimalware externo conectado; el control de producción sigue abierto hasta incorporar uno.
- Vercel Firewall: activo con DDoS Mitigation; se publicó la regla `Zaltyko auth API rate limit`, 30 solicitudes/60 s por IP sobre `/api/auth`, acción 429. Bot Protection y OWASP Managed Rules requieren plan superior/contacto comercial.
- Vercel Observability Alerts no está disponible en el plan Hobby; la UI ofrece únicamente upgrade a Pro. No se declara alerting gestionado como cerrado.
- Stripe Connect: el secreto de firma se rotó en Workbench con verificación 2FA el 2026-07-21 y se guardó únicamente como variable Sensitive de Vercel Production (`STRIPE_CONNECT_WEBHOOK_SECRET`). Se solicitó un redeploy de Production (`CugHPvZEr`); la entrega firmada end-to-end queda abierta hasta que el deployment figure Ready y exista una entrega observada con respuesta 2xx.

| ID | Archivo/símbolo | Problema y evidencia | Severidad | Riesgo de producción | Recomendación concreta | Responsable |
|---|---|---|---|---|---|---|
| SEC-001 | `src/lib/authz.ts:275-293` | Gate de permiso se salta para roles baseline sin `roleId` (AUTH-001). | Crítica | Lectura/mutación no autorizada de operaciones y datos de menores. | Deny-by-default y tests negativos por rol/recurso/método. | Sol |
| SEC-002 | `supabase/rls-consolidated.sql`; clientes Supabase | Policies tenant-wide no separan familia/atleta/coach; el browser llega directo a Data API. | Crítica | Exposición lateral dentro de academia. | RLS por relación/rol o retirar grants/browser access para tablas internas. | Sol |
| SEC-003 | `src/db/index.ts:43-45` | `rejectUnauthorized:false` desactiva validación de certificado DB. | Alta | MITM y fuga de credenciales/datos. | CA confiable, hostname validado, fail-closed. | Sol |
| SEC-004 | `next.config.mjs` CSP | `script-src` permite `unsafe-inline` y `unsafe-eval`. | Alta | Un XSS tiene mayor capacidad de ejecución. | Nonces/hashes; retirar `unsafe-eval` en producción y desplegar primero Report-Only. | Sol |
| SEC-005 | `src/lib/rate-limit.ts`; `src/lib/env.ts` | **Cerrado en código Día 4:** KV exige URL y token; en producción la ausencia falla cerrada y readiness reporta solo nombres faltantes. No se verificó el inventario externo de Vercel/Firewall. | Alta | Una configuración incompleta bloquea solicitudes en vez de dejarlas sin límite; falta validar operación externa. | Añadir readiness al deploy y verificar alertas/compensación Vercel sin extraer valores. | Sol |
| SEC-006 | `src/lib/uploads/file-security.ts`, `/api/upload`, `/api/assessments/videos` | **Mitigado en código:** allowlist centralizada, límites, firma binaria (magic bytes), MIME y extensión saneada; rutas únicas usan `crypto.randomBytes`. Aún no existe escaneo antimalware externo ni confirmación de bucket privado en Supabase. | Media | Archivos polimórficos o malware avanzado requieren un control fuera del proceso web; una política de bucket incorrecta podría exponer objetos. | Configurar bucket privado y escaneo asíncrono en Supabase/worker, luego probar descarga autorizada y rechazo anónimo. | Sol |
| SEC-007 | `package.json:engines`, `pnpm-lock.yaml`; CI | El scanner detectó inicialmente `protobufjs@7.6.4` y `immutable@3.8.3`. Se elevaron los overrides a `^7.6.5` y `^4.3.9`, se regeneró lockfile y `pnpm audit --audit-level high --prod` queda en cero; el escaneo completo conserva una baja y una moderada transitivas. | Media | El bloqueo de severidad alta está resuelto, pero quedan advisories no bloqueantes y deuda de SBOM/policy. | Mantener el gate high/critical, evaluar reemplazo de `swagger-ui-react`/`immutable` y revisar advisories oficiales en cada release. | Sol |
| SEC-008 | logging/error handlers | Persisten respuestas/logs heterogéneos; no se demostró redacción sistemática de PII en 292 rutas. | Media | Datos personales en logs y respuesta inconsistente a incidentes. | Política de redacción y test de no-secrets/PII en logger y errores. | Sol |
| SEC-009 | webhooks/cron | **Parcial Día 4/7:** tests automatizan firma/raw body/tolerancia, duplicado, rechazo cross-account, error reintentable, HMAC Mailgun fresco y leases concurrentes. La rotación Stripe Connect ya fue completada con 2FA y el secreto nuevo está en Vercel Production; no se observa todavía una entrega firmada del deployment redeployado. | Media | Una diferencia del proveedor o del entorno desplegado podría escapar a los dobles locales; un secreto mal propagado dejaría pagos sin reconciliar. | Esperar estado Ready de `CugHPvZEr`, enviar un evento benigno desde Stripe Workbench y conservar el resultado 2xx/idempotencia; completar SCA en sandbox sin dinero real. | Sol |

## Controles positivos

- Verificación de firma Stripe y cron con secreto; route auditor clasifica webhooks/cron.
- Bearer se valida contra Supabase; super-admin valida firma o consulta Auth.
- RLS declarado en 69 tablas tenant-scoped y ledger de migraciones consistente.
- Zod o validación equivalente está presente en 176 handlers, aunque no constituye cobertura universal.

## Cierre Día 2

- SEC-002 baja de crítica sin control a **alta/parcial**: policy core y matriz RLS real preparadas, no aplicadas a producción; dominios secundarios tenant-wide siguen abiertos.
- SEC-003 queda **cerrada en código**: CA obligatoria para host remoto, validación de certificado activa y prueba unitaria fail-closed.
- Los helpers privados niegan invocación anónima. Los wrappers públicos históricos están explícitamente limitados a resultados escalares `NULL/false` para anónimo y se mantienen solo por compatibilidad.
- Los diez catálogos deportivos globales quedan con RLS, lectura solo autenticada y escrituras browser revocadas; `verify:permissive-policies` falla ante cualquier nueva tabla pública sin RLS salvo el ledger interno de Drizzle.
- No se ejecutó Data API remota ni SQL de negocio. Durante el cierre se ejecutaron consultas PostgreSQL de metadatos read-only y el ledger aplicó únicamente las dos migraciones revisadas; no se leyeron filas de producto ni se imprimieron credenciales.

## Cierre local Día 3 y pase a Día 4

- SEC-001 permanece cerrado con negativas focalizadas de authz/resource scope, auditor semántico estricto y harness completo verdes.
- Se corrigieron elevaciones por rol global, override de tenant en atletas, scope de vídeos de evaluación y tres verificaciones tenant/academia invertidas.
- El arnés histórico ya forma parte del gate normal: 86 archivos y 618/618 tests bajo la configuración normal y la de seguridad. Se corrigieron además la pérdida de `context.params` al envolver rutas con rate limit y la precedencia de prefijos específicos.
- `pnpm test:rls:local` aplica las migraciones Día 2 + Día 3 en un clúster PostgreSQL efímero, prueba owner/coach/parent/athlete/viewer/super-admin/anónimo, audita 102 tablas (0 sin RLS) y revierte fixtures/cluster. Las lecturas de comunicación requieren el rol DB `authenticated`, evitando que `anon` evalúe helpers privados.
- El alcance local y la promoción revisada están completos para Día 4. El ledger aplicó las dos migraciones en remoto sin tocar filas de negocio; siguen pendientes PostgREST/Realtime y least-privilege secundario.

## Evidencia externa adicional — 2026-07-21

- Stripe test mode respondió 200 para cuenta, balance, precios y webhook; el endpoint Connect quedó en `https://zaltyko.com/api/stripe/connect/webhook`. Un PaymentIntent 3DS alcanzó `requires_action` y fue cancelado sin cargo.
- Supabase Storage `uploads` permanece privado, con límite de 50 MiB y allowlist de imágenes/vídeos. La descarga anónima de un objeto temporal devolvió 400 y el objeto fue eliminado. Antimalware y URLs firmadas/proxy siguen pendientes.
- El validador de vídeo y el copy de la API se alinearon con ese límite remoto; ya no anuncian 100 MiB que Storage no puede aceptar.
- Spot-check read-only de `https://zaltyko.com/` y del webhook: Vercel responde 200/405 respectivamente, con CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy`; la configuración WAF/alertas no es observable sin acceso al proyecto Vercel.

## Cierre local Día 4

- Eventos Connect quedan ligados a la cuenta conectada, academia, tenant, importe y moneda esperados. Los errores permanentes se registran como rechazados y los transitorios siguen siendo reintentables.
- Refunds e invitaciones/vínculos reclaman estado bajo transacción; los cron usan un advisory lease por job. Esto cierra duplicados locales, no sustituye una prueba distribuida contra los proveedores.
- El webhook Mailgun heredado exige timestamp dentro de cinco minutos, HMAC válido, comparación constante y escapa el contenido reenviado. Sigue pendiente un ledger de nonces para bloquear dos entregas válidas dentro de esa ventana.
- Email Brevo y rate limit dejan de degradarse silenciosamente en producción. Los errores persistidos omiten cuerpos del proveedor, y logs de WhatsApp ya no incluyen teléfono ni mensaje.
- Playwright autenticado Chromium pasó 12/13 pruebas; falló el spot-check responsive por timeout de navegación/afirmación de `overflow-x`. La suite axe pública pasó landing/login; las superficies autenticadas fallaron antes de axe. Stripe test mode respondió 200; el webhook Connect fue corregido al dominio productivo y el PaymentIntent SCA se canceló sin cargo. El secreto de firma/entrega real sigue sin verificar.
