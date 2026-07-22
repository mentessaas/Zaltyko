# Auditoría de entorno

## Contrato observado

El scan estático encontró 108 nombres `process.env` y solo 38 entradas en `.env.example`. El número incluye flags de scripts/seed/CI; la brecha relevante es que no existe un catálogo único por consumidor y entorno. Nunca se copiaron valores reales.

| Grupo | Variables representativas | Exposición | Entorno/consumidor |
|---|---|---|---|
| DB | `DATABASE_URL`, `DATABASE_URL_DIRECT`, `NODE_EXTRA_CA_CERTS` | Secreto | servidor, migraciones |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | dos públicas / dos secretas | browser, SSR, admin |
| Auth/app | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `E2E_*`, `ENABLE_DEV_FEATURES` | mixta | runtime, E2E, desarrollo |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, IDs de price/product | mixta | billing/webhooks/browser |
| Email | `BREVO_API_KEY`, `BREVO_SENDER_*`, `BREVO_REPLY_TO`, `MAILGUN_SIGNING_KEY` | secreto/config | servidor/webhook |
| Rate limit | `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_URL` | secreto | servidor/middleware |
| Observabilidad | `SENTRY_*`, `NEXT_PUBLIC_SENTRY_*`, `POSTHOG_*` | mixta | build/runtime/browser |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | mixta | browser/servidor |
| Cron | `CRON_SECRET` | secreto | Vercel cron/handlers |

## Paridad

- `.env.example` ya cubre `NEXT_PUBLIC_SITE_URL`, `BREVO_REPLY_TO` y `MAILGUN_SIGNING_KEY`; varias variables Sentry/PostHog y flags operativos continúan fuera del contrato canónico.
- El ejemplo principal ya documenta las dos exposiciones VAPID requeridas por los consumidores: `VAPID_PUBLIC_KEY` en servidor y `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en navegador.
- `GOOGLE_CLIENT_ID` y `NEXTAUTH_SECRET` fueron retirados del contrato activo; la autenticación canónica es Supabase Auth.
- CI usa placeholders y Node 20. Vercel no puede auditarse desde el repositorio; se documenta como control externo pendiente, no como conformidad.
- `src/lib/env.ts` deja gran parte del contrato opcional y en producción solo advierte por un subconjunto.

## Hallazgos

### Verificación externa 2026-07-21

- Vercel tiene `BREVO_API_KEY` como Sensitive en Production/Preview y también `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME` para el remitente verificado `hola@zaltyko.com`/`Zaltyko`.
- Vercel Storage contiene la base Upstash Redis `upstash-kv-byzantine-magnet`, plan Free, región primaria `iad1`, conectada a Production y Preview con prefijo `KV_REST_API`; la UI confirma la presencia de `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
- El redeploy de Production que incorpora estas variables (`6FDj8Ff1aoNdeDHf7wvcce2x8FFS`) estaba en estado `Building` al congelar esta nota; la verificación runtime final debe ejecutarse cuando figure `Ready`.

| ID | Archivo/símbolo | Problema y evidencia | Severidad | Riesgo de producción | Recomendación concreta | Responsable |
|---|---|---|---|---|---|---|
| ENV-001 | `.env.example`, `scripts/audit-env-contract.ts`, CI | El contrato activo queda cubierto por 49 variables de runtime documentadas; un auditor estático falla si aparece una nueva `process.env.*` sin entrada en `.env.example`. | Baja | El drift futuro queda bloqueado en CI; no sustituye la validación de valores externos. | Mantener `pnpm audit:env` como gate y revisar requiredness por feature en deploy. | Sol |
| ENV-002 | `.env.example`; `src/lib/supabase/**`; `package.json` | El runtime Supabase ya no instala NextAuth ni exige `NEXTAUTH_SECRET`/`GOOGLE_CLIENT_ID`; quedan referencias históricas fuera del contrato operativo. | Baja | Un runbook legacy puede provocar configuración innecesaria. | Archivar/re-etiquetar documentos históricos, sin cambiar contratos activos. | Terra |
| ENV-003 | `.env.example`; `.env.pwa.example`; push | **Cerrado en código Día 4:** se documentan las claves públicas server/browser y readiness exige ambas, además de private key y subject. | Media | La configuración externa aún debe contener las cuatro variables. | Verificar solo nombres en Preview/Production antes del deploy. | Sol |
| ENV-004 | `src/lib/env.ts` | **Mitigado Día 4:** existe readiness por Stripe, Connect, webhooks, cron, email, push y KV; email/rate limit fallan cerrados en producción. Aún no es un gate automático de deploy. | Alta | Configuración incompleta bloquea la feature en runtime y puede descubrirse tarde. | Ejecutar readiness por feature en CI/deploy sin imprimir valores. | Sol |
| ENV-005 | configuración externa Vercel | No existe evidencia versionada de paridad Preview/Production. | Media | Preview puede probar una configuración distinta a producción. | Exportar solo nombres/metadatos, nunca valores, y compararlos en un job de readiness. | Terra |

## Evidencia Día 4

`getFeatureReadiness()` devuelve únicamente nombres faltantes y nunca valores. Se verificaron contratos para Stripe/Connect/webhooks/cron/email/push/KV con tests locales; no se consultaron ni modificaron secretos de Vercel. `getAppUrl()` prioriza el origen canónico configurado y elimina la dependencia de headers controlables por el cliente para enlaces de invitación.

## Corrección Día 7 — contrato automatizado

`pnpm audit:env` escanea el runtime (`src/`, middleware y configuración de Next/Sentry) y falla si una nueva referencia `process.env.*` no aparece en `.env.example`. El gate se ejecuta en CI sin imprimir valores. En el snapshot actual pasa con 49 variables documentadas; las variables de scripts, seeds y E2E quedan fuera del contrato de runtime.

## Reconciliación 2026-07-22

- Supabase Auth es el contrato activo; `NEXTAUTH_SECRET`/NextAuth son referencias históricas y no deben añadirse al entorno.
- El monitor propio usa el `GITHUB_TOKEN` efímero del workflow con `contents: read` e `issues: write`; no introduce secretos de aplicación.
- `protobufjs` queda fijado a 7.6.5 en el árbol remoto. Dependabot #191 sigue abierto hasta que GitHub reprocese el lockfile corregido.
- `/api/health` productivo respondió 200 y no devolvió valores de entorno, credenciales ni filas.
