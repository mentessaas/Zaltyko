# Libraries Index

## Overview

~120 utility files organized by domain in `src/lib/`.

## Core Libraries

| File | Purpose |
|------|---------|
| `authz.ts` | Auth middleware (withTenant, withSuperAdmin) |
| `api-response.ts` | apiSuccess, apiCreated, apiError |
| `api-error-handler.ts` | Error handling |
| `rate-limit.ts` | Rate limiting with Vercel KV |
| `env.ts` | Environment validation |
| `logger.ts` | Logging system |
| `errors.ts` | Custom error classes |
| `permissions.ts` | Permission utilities |
| `constants.ts` | Project constants |

## Auth & Authorization (`authz/`)

```
src/lib/authz/
├── tenant-resolver.ts    # Extract tenant from URL
├── user-resolver.ts     # Get user from session
├── permissions-service.ts # Permission checks
├── profile-service.ts   # Profile management
├── profile-updater.ts   # Update profiles
├── audit-service.ts     # Audit logging
└── errors.ts            # Auth errors
```

## Stripe (`stripe/`)

```
src/lib/stripe/
├── client.ts            # Stripe client
├── webhook-handler.ts   # Process webhooks
├── subscription-service.ts # Subscriptions
├── checkout-service.ts  # Checkout flows
├── invoice-service.ts   # Invoices
├── plan-service.ts      # Plan management
├── sync-plans.ts        # Sync with Stripe
├── billing-events-service.ts # Event logging
├── context-resolver.ts  # Context from metadata
├── notification-service.ts # Stripe notifications
├── date-utils.ts       # Date utilities
└── metadata-utils.ts   # Metadata helpers
```

## AI (`ai/`)

```
src/lib/ai/
├── client.ts            # MiniMax client
├── orchestrator.ts      # AI orchestrator singleton
├── types.ts             # Type definitions
├── prompts/
│   ├── attendance.ts    # Attendance prompts
│   ├── billing.ts       # Billing prompts
│   └── communication.ts # Communication prompts
└── services/
    ├── attendance-ai.ts # Attendance AI
    ├── billing-ai.ts    # Billing AI
    └── communication-ai.ts # Communication AI
```

## Billing (`billing/`)

```
src/lib/billing/
├── athlete-fees.ts      # Calculate athlete fees
├── discount-calculator.ts # Apply discounts
├── proration.ts         # Prorate charges
└── sync-charges.ts      # Sync charges
```

## Notifications (`notifications/`)

```
src/lib/notifications/
├── notification-service.ts  # CRUD
├── email-service.ts        # Email sender
├── push-service.ts         # Web push
├── whatsapp-service.ts     # WhatsApp
├── ticket-service.ts       # Support tickets
├── realtime-setup.ts       # Supabase Realtime
├── event-recipients.ts     # Event recipients
├── event-email-content.ts  # Event email content
└── eventsNotifier.ts       # Event notifier
```

## Email (`email/`)

```
src/lib/email/
├── email-service.ts      # Main email service
├── triggers.ts           # Email triggers
└── templates/            # React email templates
    ├── welcome-email.tsx
    ├── attendance-reminder.tsx
    ├── class-cancellation.tsx
    ├── event-invitation.tsx
    └── payment-reminder.tsx
```

## Reports (`reports/`)

```
src/lib/reports/
├── attendance-calculator.ts
├── churn-report.ts
├── class-report.ts
├── coach-report.ts
├── financial-calculator.ts
├── pdf-generator.ts
└── progress-analyzer.ts
```

## Dashboard (`dashboard/`)

```
src/lib/dashboard/
├── types.ts              # Type definitions
├── metrics-calculator.ts # Advanced metrics
└── gr-metrics.ts        # GR-specific metrics
```

## Classes (`classes/`)

```
src/lib/classes/
├── class-utils.ts        # Class utilities
├── get-class-athletes.ts # Get enrolled athletes
└── schedule-conflicts.ts # Conflict detection
```

## Athletes (`athletes/`)

```
src/lib/athletes/
├── age-category.ts       # Age calculation
└── level-utils.ts        # Level utilities
```

## Alerts (`alerts/`)

```
src/lib/alerts/
├── attendance-alerts.ts
├── capacity-alerts.ts
├── class-reminders.ts
├── payment-alerts.ts
└── attendance/
    └── createAttendanceNotifications.ts
```

## Supabase (`supabase/`)

```
src/lib/supabase/
├── client.ts            # Browser client
├── server.ts            # Server client
├── admin.ts             # Admin client
├── middleware.ts        # SSR middleware
├── realtime-helpers.ts  # Realtime helpers
├── storage-helpers.ts   # Storage helpers
└── verify-setup.ts      # Setup verification
```

## Limits (`limits/`)

```
src/lib/limits/
├── errors.ts            # Limit errors
└── resource-counters.ts # Resource counting
```

## Other Utilities

| File | Purpose |
|------|---------|
| `dashboard.ts` | Main dashboard service |
| `limits.ts` | Plan limits enforcement |
| `analytics.ts` | PostHog analytics |
| `brevo.ts` | Brevo email client |
| `whatsapp.ts` | Twilio WhatsApp |
| `date-utils.ts` | Date utilities |
| `sessions-generator.ts` | Generate sessions |
| `onboarding.ts` | Onboarding flow |
| `onboardingCopy.ts` | Onboarding copy |
| `metrics.ts` | Metrics service |
| `offline/db.ts` | IndexedDB wrapper |
| `offline/operations-queue.ts` | Offline queue |
| `mcp/` | MCP tools |
| `receipts/receipt-generator.ts` | Receipt PDF |
| `scheduling/coach-availability.ts` | Coach availability |
| `search/search-service.ts` | Search |
| `seo/clusters.ts` | SEO clusters |
| `storage/upload.ts` | File uploads |
| `validation/` | Validators |
| `validation-middleware.ts` | Validation middleware |