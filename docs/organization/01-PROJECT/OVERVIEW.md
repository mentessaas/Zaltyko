# Project Overview - Zaltyko

## What is Zaltyko?

SaaS platform for managing sports academies (gymnastics, dance, parkour). Multi-tenant architecture where each academy has isolated data.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 14.2** | App Router framework |
| **React 18.3** | UI library |
| **TypeScript 5** | Type safety |
| **Drizzle ORM** | Database ORM |
| **Supabase** | PostgreSQL + Auth + Storage |
| **NextAuth v5** | Authentication |
| **Stripe** | Payments & subscriptions |
| **Tailwind CSS** | Styling |
| **shadcn/ui** | UI component library |
| **Zod** | Input validation |
| **PostHog** | Analytics |
| **MiniMax (AI)** | AI features (attendance, billing, communication) |
| **Brevo** | Transactional emails |
| **Twilio WhatsApp** | WhatsApp notifications |
| **Vercel KV** | Rate limiting (Redis) |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (site)/            # Public landing pages
│   ├── (public)/           # Public pages (empleo, marketplace)
│   ├── (super-admin)/      # Super admin panel
│   ├── app/[academyId]/   # Academy dashboard (protected)
│   ├── actions/           # Server Actions
│   └── api/               # API routes (100+ endpoints)
├── components/            # React components (~250 files)
│   ├── ui/                # shadcn/ui base components
│   ├── athletes/          # Athletes module
│   ├── classes/          # Classes module
│   ├── events/          # Events module
│   ├── billing/         # Billing module
│   ├── dashboard/       # Dashboard widgets
│   └── landing/         # Landing page components
├── db/schema/            # Drizzle schema (77 tables)
├── lib/                  # Utilities & services (~120 files)
│   ├── authz/           # Authorization (withTenant, permissions)
│   ├── stripe/          # Stripe integration
│   ├── ai/              # AI services (MiniMax)
│   ├── notifications/   # Email, push, WhatsApp
│   ├── reports/         # Report generators
│   └── dashboard/       # Dashboard metrics
├── hooks/               # Custom React hooks
└── types/               # TypeScript types
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/authz.ts` | Auth middleware - `withTenant()`, `withSuperAdmin()` |
| `src/lib/api-response.ts` | Standard API responses |
| `src/lib/limits.ts` | Plan limits enforcement |
| `src/lib/dashboard.ts` | Dashboard data service |
| `src/db/schema/index.ts` | All database tables |
| `src/app/api/route.ts` | API conventions |

## Key Patterns

### API Routes (all use withTenant)
```typescript
import { withTenant } from '@/lib/authz';
import { apiSuccess, apiCreated } from '@/lib/api-response';

export const POST = withTenant(async (request: Request) => {
  return apiCreated({ id: newId });
});
```

### Response Format
```typescript
// Success
{ "ok": true, "data": {...} }

// Error
{ "ok": false, "error": "ERROR_CODE", "message": "..." }
```

### Components (memoized)
```typescript
import { memo } from 'react';
const MyComponent = memo(function MyComponent({ prop }: Props) { ... });
export default MyComponent;
```

## More Details

- [Setup Guide](../02-SETUP/SETUP.md)
- [Architecture](../03-ARCHITECTURE/OVERVIEW.md)
- [API Reference](../07-API/index.md)
- [Database Schema](../08-DATABASE/schema.md)