# Zaltyko - Sports Academy Management

## Stack

- **Framework:** Next.js 15.5 (App Router)
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
│   ├── api/                 # API routes (all use withTenant)
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
// ✅ CORRECT - all APIs use withTenant
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

- All APIs use `withTenant` for multi-tenant isolation
- RLS policies enforce tenant isolation at DB level
- Zod validation on all API inputs
- Stripe webhook signature verification
- Rate limiting on all endpoints

## Recent Changes (2026-04-02)

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
