# Zaltyko — Gestión para academias de gimnasia

![Status](https://img.shields.io/badge/Status-Hardening-yellow)
![Stack](https://img.shields.io/badge/Stack-Next.js_15_|_Supabase_|_Stripe-blue)
![License](https://img.shields.io/badge/License-Private-red)

Zaltyko es un SaaS multi-tenant para academias de gimnasia artística y rítmica. Centraliza gimnastas, familias, entrenadores, grupos, clases, asistencia, evaluaciones, eventos y cobros.

## Qué no es Zaltyko

Zaltyko no es software fiscal ni un sistema VeriFactu. Los recibos internos acreditan pagos dentro de la academia, pero no sustituyen una factura fiscal. Cada academia es responsable de su contabilidad, impuestos, disputas y chargebacks.

Zaltyko tampoco custodia el dinero de las familias: con Stripe Connect Standard, cada academia conecta su propia cuenta y recibe los fondos directamente.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 App Router, React 18, Tailwind CSS, shadcn/ui |
| Backend | Next.js Route Handlers, Drizzle ORM |
| Base de datos | Supabase PostgreSQL + RLS |
| Autenticación | NextAuth.js v5 + Supabase |
| Cobros | Stripe Billing + Stripe Connect Standard |
| Email | Brevo |
| Infraestructura | Vercel + Supabase |
| Observabilidad | Sentry, Vercel Analytics, Speed Insights |

## Módulos principales

- Gimnastas, familias y documentación.
- Entrenadores, grupos, clases, sesiones y asistencia.
- Evaluaciones y progreso técnico.
- Eventos, competiciones, inscripciones y listas de espera.
- Cobros, descuentos, becas, pagos manuales y recibos internos.
- Stripe Connect: tarjeta familiar, cobro automático, reembolsos y reconciliación.
- Comunicación, notificaciones y recordatorios.
- Portal de familias y panel Super Admin.
- Directorios y páginas SEO por país y modalidad.

## Inicio local

```bash
git clone https://github.com/mentessaas/Zaltyko.git
cd Zaltyko
pnpm install
cp .env.example .env.local
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

La aplicación queda disponible en `http://localhost:3000`.

`pnpm db:migrate` solo admite PostgreSQL local. Para SQL remoto revisado se usa el ledger:

```bash
pnpm db:migrate:ledger
pnpm db:migrate:ledger --apply
pnpm db:migrate:ledger
pnpm check:migrations
pnpm validate:rls
```

## Verificación

```bash
pnpm typecheck
pnpm lint
pnpm test -- --run
pnpm build
pnpm verify:production
pnpm audit:api-routes:strict
pnpm check:migrations
pnpm validate:rls
```

Pruebas E2E:

```bash
pnpm test:e2e:verify-supabase
pnpm test:e2e:auth
pnpm exec playwright test tests/e2e-role-smoke.spec.ts --project=chromium
pnpm test:e2e:public:ci
pnpm test:a11y
```

Las pruebas autenticadas usan cuentas existentes y aisladas. El aprovisionamiento requiere `E2E_ALLOW_PROVISIONING=true` y nunca debe ejecutarse contra una academia operativa ni en CI.

## Seguridad

- Aislamiento multi-tenant mediante comprobaciones server-side y RLS.
- `withTenant` y `verifyAcademyAccess` en rutas con datos de academia.
- Rate limiting global mediante Vercel KV.
- Validación de entrada con Zod.
- Webhooks Stripe firmados e idempotentes.
- Tarjetas alojadas por Stripe; Zaltyko nunca almacena PAN ni CVC.
- Bloqueo transaccional e idempotency keys para evitar cobros duplicados.

## Variables críticas de producción

Consultar `.env.example`. Como mínimo:

- Supabase y URLs de base de datos.
- `NEXTAUTH_SECRET`, `INTERNAL_AUTH_SECRET` y `CRON_SECRET`.
- Vercel KV.
- Stripe de plataforma y Stripe Connect.
- Brevo con remitente verificado.

Nunca guardar secretos reales en Git, documentación, issues o logs.

## Estado operativo conocido

- Stripe Connect está desplegado y el onboarding fue probado en modo test real.
- El webhook Connect de producción está registrado.
- Falta cerrar QA E2E de cobro: tarjeta guardada, off-session, SCA/3DS, rechazo, reembolso y reconciliación.
- Brevo está implementado, pero producción necesita una API key real y remitente verificado. No usar el placeholder de `.env.example`.
- Las migraciones de cobros se aplicaron y verificaron mediante el ledger.

## Documentación

- [Cobros y cuotas](docs/COBROS_Y_CUOTAS.md)
- [Checklist de producción](docs/PRODUCTION_CHECKLIST.md)
- [API](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Guía de desarrollo](docs/development-guide.md)

## Licencia

Software propietario de MentesSaaS. Todos los derechos reservados.
