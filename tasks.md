# Tarea 1: Estructura de BD con Drizzle

- Crear migraciones para: academies, profiles, memberships, plans, subscriptions, athletes, coaches, classes, events, audit_logs.
- Añadir tenant_id en tablas operativas; índices por (tenant_id).

# Tarea 2: Auth + Roles + Multi-tenancy

- NextAuth con adapter Supabase.
- profiles.role ('admin'|'owner'|'coach'|'athlete').
- Middleware server: inyectar tenant_id desde session.profile a cada query.

# Tarea 3: RLS en Supabase

- Crear políticas row-level por tenant_id.
- Rol admin (superuser) con bypass: si profiles.role='admin' → acceso total.

# Tarea 4: Planes y Stripe

- Sembrar planes: free(50), pro(200), premium(null=ilimitado).
- Conectar con Stripe products/prices vía `price_id`.
- Ruta /api/stripe/webhooks: checkout.session.completed → crear/actualizar subscriptions.

# Tarea 5: Validación por plan (backend-first)

- Helper `assertWithinPlanLimits(academy_id, resource='athletes')`.
- Antes de crear atleta/clase: comprobar límites.
- Si excede: error 402 + CTA upgrade.

# Tarea 6: CRUDs

- Academies: create/update + wizard onboarding (nombre, país, región).
- Athletes, Coaches, Classes, Events: endpoints REST/route handlers.
- Zod para validaciones, useForm en UI.

# Tarea 7: Dashboards

- Academia: KPIs (atletas, coaches, clases semana, estado plan).
- Súper Admin: MRR, nº academias por plan, growth, logs, top academias.

# Tarea 8: Emails

- Mailgun: bienvenida, invitación entrenador, aviso 80% y 100% límite.

# Tarea 9: Deploy

- Vercel + variables.
- Supabase RLS on.
- Stripe webhooks configurados.

# Tarea 10: QA

- Tests de límite (49→50 OK, 50→51 bloquea en Free).
- Test upgrade Pro desbloquea (200).
- Test Premium ilimitado.

# Issues pendientes (Vitest)

- `/api/admin/users`: cubrir invitaciones y validación de tenant.
- `/api/athletes` (GET/POST) y CRUD de guardianes.
- `/api/coaches` y `/api/coaches/[coachId]/assignments`.
- `/api/class-sessions` y `/api/class-sessions/[sessionId]`.
- `/api/attendance` (GET/POST) con estados `present/absent/late/excused`.
