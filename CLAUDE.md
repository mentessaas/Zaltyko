# Zaltyko - Sports Academy Management

## Stack

- **Framework:** Next.js 14.2 (App Router)
- **Database:** Supabase PostgreSQL + RLS
- **ORM:** Drizzle ORM
- **Styling:** Tailwind CSS + shadcn/ui
- **Auth:** NextAuth.js v5 (Supabase)
- **Payments:** Stripe
- **Deployment:** Vercel

## Project Structure

```
src/
├── app/
│   ├── app/[academyId]/     # Academy dashboard routes
│   ├── api/                 # API routes (tenant routes use withTenant; others per-context)
│   ├── (site)/             # Public landing pages
│   └── (super-admin)/      # Super admin panel
├── components/
│   ├── ui/                 # shadcn/ui base + new: combobox, data-table, date-picker, file-upload
│   ├── athletes/           # Athlete module components
│   ├── classes/            # Classes module components
│   ├── events/            # Events module components
│   ├── billing/           # Billing module components
│   └── landing/           # Landing page sections (memoized cards)
├── db/schema/             # 68+ Drizzle tables
├── lib/
│   ├── authz.ts           # withTenant auth wrapper (REQUIRED for all APIs)
│   ├── api-response.ts    # apiSuccess(), apiCreated(), apiError()
│   ├── seo/clusters.ts   # Cluster page utilities
│   ├── mcp/              # MCP tools (modularized)
│   ├── dashboard/        # Dashboard types (extracted)
│   └── geo-loader.ts     # Lazy city loading
└── types/                # Centralized types (athletes.ts)
```

## Critical Patterns

### API Auth (MANDATORY)
```typescript
// ✅ CORRECT - tenant-scoped APIs use withTenant (see Security for other wrappers)
import { withTenant } from '@/lib/authz';
export const POST = withTenant(async (request: Request) => { ... });

// ❌ WRONG - missing auth
export async function POST(request: Request) { ... }
```

### API Responses (STANDARDIZED)
```typescript
// ✅ CORRECT
import { apiSuccess, apiCreated } from '@/lib/api-response';
return apiSuccess({ items }, { total, page, pageSize });
return apiCreated({ id: newId });

// ❌ WRONG
return NextResponse.json({ ok: true, data: items });
```

### Component Memoization
```typescript
// ✅ CORRECT - memoized cards
import { memo } from 'react';
const EventCard = memo(function EventCard({ event }: Props) { ... });
export default EventCard;
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Push schema to Supabase |
| `pnpm db:seed` | Seed initial data |
| `pnpm lint` | ESLint check |
| `pnpm typecheck` | TypeScript check |

## Environment Variables

See `.env.example`. Required:
- `DATABASE_URL` - Supabase PostgreSQL
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (for admin)
- `STRIPE_SECRET_KEY` - Stripe secret key
- `NEXTAUTH_SECRET` - NextAuth secret

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/authz.ts` | Auth wrapper with tenant context |
| `src/lib/api-response.ts` | Standardized API responses |
| `src/lib/rate-limit.ts` | Rate limiting with Vercel KV |
| `src/db/schema/` | All database tables |
| `src/components/ui/skeletons/` | Loading skeletons |

## Security

- Tenant-scoped APIs use `withTenant`; the rest are guarded by the appropriate wrapper for their context: `withSuperAdmin` (super-admin), `withBearerTenant` (mobile/bearer), session-scoping via `auth.getUser` + `verifyAcademyAccessForProfile` (self/me/profile/onboarding/support), signature verification (Stripe/LemonSqueezy/Mailgun webhooks), `requireCronAuth` (cron), or intentionally public + rate-limited (landing/directory/leads/contact). Audited 2026-07-03: 265 routes, 0 authz/IDOR gaps. NOT every route uses `withTenant` — do not assume it.
- RLS is **defense-in-depth for direct Supabase-client access** (anon/authenticated key: support/tickets, realtime, storage, public actions). It is NOT a safety net for server-side queries: the app connects as `postgres` with `BYPASSRLS`, so server tenant isolation depends entirely on the auth wrappers above, not on RLS.
- **Permission escalation fixed 2026-07-03**: `src/lib/authz/permissions-service.ts` used to grant `getAllPermissions()` to ANY profile with global role `owner` (the signup default for everyone) on ANY academy, without checking ownership. Now it verifies `academies.ownerId === profile.id` (or an explicit `owner` membership row) before granting full permissions. Do not revert this check without re-auditing — it was a real cross-tenant privilege escalation, not theoretical.
- Zod validation on all API inputs — remember schemas must accept `null` explicitly (`.nullable()`) if any client form ever sends `null` for an empty field; `.optional()` alone only covers `undefined` and causes silent 400s (see settings route fix 2026-07-07).
- Stripe webhook signature verification (`constructEvent` + `STRIPE_WEBHOOK_SECRET`)
- Rate limiting on all endpoints
- Server-only modules (env validation, DB clients) must guard `typeof window === "undefined"` at module scope if there's any chance of transitive import from a `"use client"` file (e.g. via `lib/logger.ts` → `app/error.tsx`) — otherwise validation logic and its console output run in the browser too. Fixed in `src/lib/env.ts` 2026-07-07.

## Recent Changes (2026-07-07)

- **Super-admin CRUD completo**: el panel `/super-admin` ahora permite crear academias (+ cuenta del dueño), crear/eliminar usuarios con cualquier rol, y editar todos los campos de una academia (nombre, tipo, país, región, ciudad, plan, suspensión) — antes solo nombre/plan eran editables y no había forma de crear nada desde el panel. Ver `SuperAdminCreateAcademyDialog.tsx`, `SuperAdminCreateUserDialog.tsx`, `SuperAdminAcademyDetail.tsx`, `src/lib/supabase/admin-operations.ts` (`createAuthUser`/`deleteAuthUser`). Guardas: no auto-eliminación, no eliminar el último `super_admin`.
- **Fix**: la API envuelve todas las respuestas en `{ok, data}` (ver `apiSuccess()`), pero el componente de detalle de academia estaba usando la respuesta cruda tras cada guardado/suspensión — causaba que el formulario mostrara "Sin nombre"/"Sin plan" después de guardar aunque los datos en DB estaban intactos. Si un componente hace `fetch(...).then(r => r.json())` contra una API que usa `apiSuccess`, siempre desestructurar `{ data }`.
- **Fix**: `PATCH /api/academies/[academyId]/settings` devolvía 400 en cada guardado desde Ajustes de la academia porque el form cliente envía `null` (no `undefined`) en campos vacíos de contacto/descripción, y el schema Zod solo aceptaba `string | undefined`. Ver nota en Security sobre `.nullable()`.
- **Fix de seguridad**: escalada de permisos en `permissions-service.ts` (ver Security). Auditoría externa de roles verificada contra prod antes de aplicar el fix — el script de remediación propuesto tenía un bug que habría roto el signup (`DROP TRIGGER on_auth_user_created`), se descartó esa parte.
- Purga completa de datos de test en producción: quedan solo las 2 cuentas reales y la academia real, sin huérfanos.

## Historial anterior (2026-04-02)

- Added `combobox`, `data-table`, `date-picker`, `file-upload` UI primitives
- Memoized landing cards: AcademyCard, CoachCard, EventCard, InvitationCard
- Standardized API responses with apiSuccess/apiCreated
- Fixed AI endpoint auth (all now protected with withTenant)
- Added MCP tools modularization
- Extracted dashboard types and GR metrics

## Documentation

See `docs/` directory:
- `SUMMARY.md` - Document index
- `PROJECT_STRUCTURE.md` - Full project tree
- `ARCHITECTURE.md` - Technical architecture
- `API.md` - API reference

## Deployment

1. Push to GitHub
2. Connect repo to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

**IMPORTANT**: Rotate all credentials before production deployment.
