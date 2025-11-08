Título: SaaS de gestión de academias de gimnasia – Arquitectura basada en ShipFree

Objetivo:

Construir un SaaS multi-academia (tenancy) con Next.js 14 (App Router), Drizzle ORM + Postgres (Supabase), Auth con NextAuth + Supabase, Stripe para planes y suscripciones, UI con Tailwind + shadcn, emails (Mailgun). Modelo freemium: Free (<=50 atletas), Pro (<=200), Premium (ilimitado). Validaciones por backend. Panel de Súper Admin.

Piezas técnicas:

- Next.js 14 + React Server Components
- Drizzle ORM + Postgres (Supabase)
- NextAuth + Supabase Adapter
- Stripe (Products/Prices/Webhooks)
- Mailgun (emails transaccionales)
- RLS en Supabase por tenant_id
- E2E: zod para validación, react-hook-form, tRPC o rutas REST en /app/api

Entidades principales:

- users (NextAuth)
- profiles (id, user_id, name, role: 'owner' | 'coach' | 'athlete' | 'admin', tenant_id)
- academies (id, name, country, region, owner_id, tenant_id)
- memberships (id, user_id, academy_id, role)
- plans (id, code: 'free'|'pro'|'premium', athlete_limit, price_id)
- subscriptions (id, academy_id, plan_id, status, current_period_end, stripe_customer_id, stripe_sub_id)
- athletes (id, academy_id, name, dob, level, tenant_id)
- coaches (id, academy_id, name, email, phone, tenant_id)
- classes (id, academy_id, name, weekday, start_time, end_time, capacity, tenant_id)
- events (id, academy_id, title, date, location, status, tenant_id)
- audit_logs (id, tenant_id, user_id, action, meta, created_at)

Políticas RLS:

- Cada tabla con columna tenant_id (excepto plans).
- Usuario solo accede a filas con su tenant_id; Súper Admin bypass.

Flujos:

1) Onboarding: user crea cuenta → crea academia → asigna plan Free → invita a entrenadores → crea atletas/clases.
2) Upgrade plan: al superar límites → CTA pagar con Stripe → Webhook activa Pro/Premium.
3) Validación de límites: middleware backend para atletas/clases según plan.
4) Panel Súper Admin: ver academias, planes, MRR, logs, forzar cambios.

Entregables:

- Esquema Drizzle + migraciones
- Rutas API (auth, academy, athletes, coaches, classes, events)
- Stripe webhooks
- UI: Dashboard Academia + Dashboard Súper Admin
- Tests básicos (unit/api)
