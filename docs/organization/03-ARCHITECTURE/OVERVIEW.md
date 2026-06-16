# Architecture Overview

## High-Level Diagram

```
User → Vercel CDN → Next.js App Router
                          ↓
                   NextAuth (Supabase Auth)
                          ↓
                   Drizzle ORM → PostgreSQL (Supabase)
                          ↓
              ┌──────────┼──────────┐
              ↓          ↓          ↓
          Stripe      MiniMax      Brevo
         (Payments)   (AI)      (Email)
```

## Multi-Tenancy

Zaltyko uses **Column Discriminator + RLS** for tenant isolation:

1. **URL-based**: `/app/[academyId]/dashboard` identifies tenant
2. **Database**: All sensitive tables have `tenant_id` column
3. **RLS**: PostgreSQL Row Level Security enforces isolation
4. **App-level**: `withTenant()` middleware validates access

```typescript
// Every API uses withTenant
export const POST = withTenant(async (request: Request) => {
  const { tenantId, userId } = context;
  // tenantId ensures data isolation
});
```

## Authentication Flow

```
1. User → /app/[academyId]/dashboard
2. Middleware extracts academyId from URL
3. NextAuth validates session via Supabase
4. withTenant() verifies user has access to academy
5. Route renders with tenant context
```

## Key Services

| Service | Location | Purpose |
|---------|----------|---------|
| Auth | `lib/authz.ts` | Tenant resolution, permissions |
| Billing | `lib/stripe/` | Stripe integration, webhooks |
| AI | `lib/ai/` | Attendance prediction, billing alerts |
| Notifications | `lib/notifications/` | Email, push, WhatsApp |
| Reports | `lib/reports/` | Attendance, financial, progress |
| Dashboard | `lib/dashboard.ts` | Aggregated metrics |

## Database Schema

77 tables organized by domain:
- **Core**: profiles, academies, memberships
- **Athletes**: athletes, groups, group_athletes
- **Classes**: classes, class_sessions, attendance_records
- **Events**: events, event_registrations, event_invitations
- **Billing**: subscriptions, plans, charges, discounts
- **Communication**: notifications, conversations

## API Architecture

All APIs follow same pattern:
- Require `withTenant` middleware
- Return standardized responses
- Use Zod for validation
- Rate limited via Vercel KV

## More Details

- [Auth System](../04-AUTH/overview.md)
- [Database Schema](../08-DATABASE/schema.md)
- [API Reference](../07-API/index.md)
- [Billing Module](../05-FEATURES/billing.md)