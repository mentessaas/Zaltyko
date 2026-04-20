# Quick Start Guide

## New to Zaltyko?

Start here to understand the project quickly.

## Step 1: Understand the Project

Read [Project Overview](./01-PROJECT/OVERVIEW.md) - 5 min read

Key points:
- Next.js 14 with App Router
- Multi-tenant (each academy isolated)
- Supabase PostgreSQL + Drizzle ORM
- Stripe for payments

## Step 2: Set Up Local Environment

Follow [Setup Guide](./02-SETUP/SETUP.md):

```bash
git clone https://github.com/mentessaas/Zaltyko.git
cd Zaltyko
pnpm install
cp .env.example .env.local
# Edit .env.local with your values
pnpm dev
```

## Step 3: Key Patterns

### API Pattern
```typescript
import { withTenant } from '@/lib/authz';
import { apiSuccess, apiCreated } from '@/lib/api-response';

export const POST = withTenant(async (request: Request) => {
  return apiCreated({ id: newId });
});
```

### Response Format
```typescript
// Success: { "ok": true, "data": {...} }
// Error: { "ok": false, "error": "CODE", "message": "..." }
```

### Component Pattern
```typescript
import { memo } from 'react';
const MyComponent = memo(function MyComponent({ prop }: Props) {
  return <div>{prop}</div>;
});
export default MyComponent;
```

## Step 4: Explore Modules

| Module | Start Here |
|--------|------------|
| Athletes | [Athletes](./05-FEATURES/athletes.md) |
| Classes | [Classes](./05-FEATURES/classes.md) |
| Billing | [Billing](./05-FEATURES/billing.md) |
| Events | [Events](./05-FEATURES/events.md) |

## Step 5: Understand Auth

Read [Auth Overview](./04-AUTH/overview.md) - critical for understanding data isolation

## Step 6: Check Database Schema

See [Database Schema](./08-DATABASE/schema.md) to understand data model

## Common Tasks

### Create a new API endpoint
1. Create `src/app/api/your-resource/route.ts`
2. Use `withTenant` wrapper
3. Return `apiSuccess()` or `apiCreated()`

### Create a new component
1. Add to appropriate `src/components/[module]/` folder
2. Use `memo()` for performance
3. Export as default

### Add a new database table
1. Create `src/db/schema/your-table.ts`
2. Add to `src/db/schema/index.ts`
3. Run `pnpm db:generate && pnpm db:migrate`

## Need Help?

- Check [API Index](./07-API/index.md) for endpoints
- Check [Components](./09-COMPONENTS/index.md) for UI
- Check [Hooks](./10-HOOKS/index.md) for state management