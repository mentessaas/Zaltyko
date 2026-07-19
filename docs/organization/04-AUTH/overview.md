# Authentication & Authorization

## Overview

Zaltyko uses **NextAuth v5** with **Supabase Auth** for authentication, and a custom multi-tenant authorization system.

## Auth Files

| File | Purpose |
|------|---------|
| `src/lib/authz.ts` | Main middleware - `withTenant()`, `withSuperAdmin()` |
| `src/lib/authz/tenant-resolver.ts` | Extract tenant from URL or session |
| `src/lib/authz/user-resolver.ts` | Get user from session |
| `src/lib/authz/permissions-service.ts` | Permission checks |
| `src/lib/authz/profile-service.ts` | Profile management |
| `src/lib/authz/errors.ts` | Auth-specific errors |

## Usage Pattern

```typescript
import { withTenant } from '@/lib/authz';

export const GET = withTenant(async (request: Request) => {
  // context has: tenantId, userId, profile
  const { tenantId } = context;
  // Safe to query database with tenantId filter
});
```

## Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| `super_admin` | System admin | All academies |
| `owner` | Academy owner | Own academy only |
| `admin` | Academy admin | Own academy only |
| `coach` | Trainer | Assigned athletes/classes |
| `athlete` | Athlete | Own profile/events |
| `parent` | Parent | Children only |

## Multi-Tenancy

Every database query MUST filter by `tenantId`:

```typescript
// ✅ CORRECT
const athletes = await db.select()
  .from(athletesTable)
  .where(eq(athletesTable.tenantId, tenantId));

// ❌ WRONG - no tenant filter
const athletes = await db.select().from(athletesTable);
```

## Public vs Protected Endpoints

| Type | Pattern | Auth Required |
|------|---------|---------------|
| Public | `/api/public/*` | No |
| Protected | `/api/*` (most) | Yes - withTenant |
| Admin | `/api/super-admin/*` | Yes - withSuperAdmin |

## Session Flow

1. User logs in via NextAuth (magic link or OAuth)
2. Session stored in Supabase Auth
3. `lib/supabase/server.ts` creates server client
4. `tenant-resolver.ts` extracts tenant from URL params
5. `withTenant()` validates user has access to tenant

## Related Docs

- [Auth Middleware Source](../../src/lib/authz.ts)
- [Billing Module](../05-FEATURES/billing.md) - Auth for payments