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

### Canonical Work Guide (MANDATORY)

Before any relevant code, product, pricing, migration, security, roadmap, or documentation change, read `vault/00-Inicio/Guia de trabajo para agentes.md`.
That note is the operational source for Zaltyko's active direction: gymnastics-first go-to-market, limited family/athlete portal, internal communication first, pricing v3.0, migration discipline, and vault closeout.

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
import { apiSuccess, apiCreated } from "@/lib/api-response";
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

| Command                          | Description                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                       | Start dev server                                                                                            |
| `pnpm build`                     | Production build                                                                                            |
| `pnpm db:generate`               | Generate Drizzle migrations                                                                                 |
| `pnpm db:migrate`                | Push Drizzle solo contra PostgreSQL local; bloqueado en remoto                                              |
| `pnpm db:migrate:ledger`         | Verify versioned Supabase SQL against the production ledger (dry-run)                                       |
| `pnpm db:migrate:ledger --apply` | Apply reviewed pending Supabase SQL transactionally and record its SHA-256                                  |
| `pnpm db:migrate:reviewed <sql>` | Apply one inspected SQL only for the ledger bootstrap or an approved break-glass operation                  |
| `pnpm db:seed`                   | Seed initial data                                                                                           |
| `pnpm test`                      | Vitest unit/integration tests                                                                               |
| `pnpm test:e2e:auth`             | Generate `.auth/user.json` from `E2E_AUTH_EMAIL` + `E2E_AUTH_PASSWORD`                                      |
| `pnpm test:e2e:auth:provision`   | Provision approved isolated E2E users, then generate storage state (requires `E2E_ALLOW_PROVISIONING=true`) |
| `pnpm test:e2e:verify-supabase`  | Verify Supabase API keys and optional E2E user login without printing secrets                               |
| `pnpm test:e2e`                  | Playwright academy critical flows                                                                           |
| `pnpm test:a11y`                 | Playwright + axe accessibility checks                                                                       |
| `pnpm audit:sprint3`             | Sprint 3 E2E + accessibility audit                                                                          |
| `pnpm lint`                      | ESLint check                                                                                                |
| `pnpm typecheck`                 | TypeScript check                                                                                            |

## Environment Variables

See `.env.example`. Required:

- `DATABASE_URL` - Supabase PostgreSQL
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (for admin)
- `STRIPE_SECRET_KEY` - Stripe secret key
- `NEXTAUTH_SECRET` - NextAuth secret

## Key Files

| File                           | Purpose                          |
| ------------------------------ | -------------------------------- |
| `src/lib/authz.ts`             | Auth wrapper with tenant context |
| `src/lib/api-response.ts`      | Standardized API responses       |
| `src/lib/rate-limit.ts`        | Rate limiting with Vercel KV     |
| `src/db/schema/`               | All database tables              |
| `src/components/ui/skeletons/` | Loading skeletons                |

## Security

- All APIs use `withTenant` for multi-tenant isolation
- RLS policies enforce tenant isolation at DB level
- Zod validation on all API inputs
- Stripe webhook signature verification
- Rate limiting on all endpoints

## Sprint 3 Audit Workflow

- Responsive/a11y evidence is generated by Playwright under `test-results/` and `playwright-report/`.
- Authenticated academy checks require `E2E_ACADEMY_ID`; first run `pnpm test:e2e:verify-supabase` to confirm project keys and optional test-user login, then generate a saved browser session with `BASE_URL=http://127.0.0.1:3000 E2E_AUTH_EMAIL=... E2E_AUTH_PASSWORD=... pnpm test:e2e:auth`, then run audits with `E2E_STORAGE_STATE=.auth/user.json`. This only logs in; provisioning has its own explicit `E2E_ALLOW_PROVISIONING=true` gate for an approved isolated academy. CI always runs the public Chromium suite against `https://zaltyko.com`; authenticated CI is enabled only when its three named test-account secrets are configured, never with fabricated credentials.
- Academy terminology is sport-aware: some disciplines intentionally render labels such as `Gimnastas` from `src/lib/sport-config/catalog.ts`. Do not normalize those labels to `Atletas` unless the product requirement explicitly asks for non-sport-specific copy in that surface.
- Before Supabase migration work, review recent Supabase changelog entries and avoid destructive SQL without manually checking generated statements.
- Keep Sprint 3 fixes targeted: responsive shell, keyboard/focus, route smoke, migration status, and docs. Do not redesign modules unless a test exposes a concrete defect.

## Obsidian Vault Maintenance (MANDATORY)

- The operational knowledge base lives in `vault/`; start at `vault/00-Inicio/Home.md`.
- Every relevant change to product, architecture, business, pricing, marketing, sales, customer success, deploy, security, roadmap, or risk must update the matching note in `vault/`.
- If a change creates debt, follow-up work, or an unresolved risk, add it to `vault/06-Roadmap-y-Tareas/Backlog priorizado.md`.
- If a decision is made, record it in `vault/06-Roadmap-y-Tareas/Decisiones.md`.
- If public/commercial promises or pricing change, review `vault/04-Marketing/Mensajes aprobados.md` and `vault/03-Negocio/Pricing.md`.
- At closeout, state which vault note was updated or why the change did not require a vault update.
- Never add secrets, real credentials, or raw `.env` values to the vault.

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
