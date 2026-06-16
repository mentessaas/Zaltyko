# Billing Module - Stripe Integration

## Overview

Complete billing system with Stripe subscriptions, charges, discounts, and scholarships.

## Key Files

### Pages
```
src/app/app/[academyId]/billing/
├── page.tsx                   # Billing dashboard
├── campaigns/                # Discount campaigns
├── discounts/                # Manage discounts
├── receipts/                 # View receipts
└── scholarships/             # Manage scholarships
```

### Components
```
src/components/billing/
├── BillingPanel.tsx           # Main panel
├── BillingSummary.tsx         # Summary widget
├── PlanSelector.tsx           # Plan comparison
├── InvoiceList.tsx            # Invoice history
├── InvoiceHistory.tsx         # Full history
├── CreateChargeDialog.tsx     # Create charge
├── EditChargeDialog.tsx       # Edit charge
├── GenerateChargesDialog.tsx  # Bulk generate
├── DiscountManager.tsx        # Discount CRUD
├── DiscountHistory.tsx        # Usage history
├── CampaignManager.tsx        # Campaign CRUD
├── ScholarshipManager.tsx     # Scholarship CRUD
├── ReceiptViewer.tsx          # Receipt display
├── StudentChargesTab.tsx      # Per-student charges
├── UpgradeModal.tsx           # Upgrade flow
├── DowngradeModal.tsx         # Downgrade flow
└── PaymentMethodCard.tsx      # Saved payment
```

### Libraries
```
src/lib/stripe/                # Complete Stripe suite
├── client.ts                 # Stripe client
├── webhook-handler.ts        # Process webhooks
├── subscription-service.ts   # Subscription management
├── checkout-service.ts       # Checkout flows
├── invoice-service.ts        # Invoice management
├── plan-service.ts           # Plan sync
└── sync-plans.ts             # Sync plans with Stripe

src/lib/billing/
├── athlete-fees.ts           # Calculate fees
├── discount-calculator.ts    # Apply discounts
├── proration.ts              # Prorate changes
└── sync-charges.ts           # Sync charges

src/lib/limits.ts             # Plan limits enforcement
```

## Subscription Plans

| Plan | Athletes | Coache | Price |
|------|----------|--------|-------|
| FREE | 50 | 2 | 0 |
| PRO | 200 | 10 | 19€/mo |
| PREMIUM | Unlimited | Unlimited | 49€/mo |

## Hard Limits

`src/lib/limits.ts` blocks creation when plan limit reached:

```typescript
const canCreate = await checkLimit(tenantId, 'athletes', 50);
if (!canCreate) {
  throw new LimitError('ATHLETE_LIMIT_REACHED');
}
```

## Payment Flow

```
1. User clicks upgrade → /api/billing/checkout
2. Create Stripe Checkout Session
3. User pays on Stripe
4. Webhook receives invoice.paid
5. Update subscription in DB
6. Unlock plan limits
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/status` | Get subscription status |
| POST | `/api/billing/checkout` | Create checkout session |
| POST | `/api/billing/portal` | Open customer portal |
| POST | `/api/billing/upgrade` | Upgrade plan |
| POST | `/api/billing/downgrade` | Downgrade plan |
| POST | `/api/billing/cancel` | Cancel subscription |
| GET | `/api/billing/plans` | List available plans |
| GET | `/api/charges` | List charges |
| POST | `/api/charges` | Create charge |
| POST | `/api/charges/bulk` | Bulk create monthly charges |
| POST | `/api/discounts` | Create discount |
| POST | `/api/scholarships` | Create scholarship |

## Webhooks

| Event | Handler Action |
|-------|----------------|
| `invoice.paid` | Update subscription status |
| `customer.subscription.updated` | Sync plan limits |
| `customer.subscription.deleted` | Downgrade to FREE |

## Related Tables

- `plans` - Plan definitions
- `subscriptions` - User subscriptions
- `charges` - Monthly charges
- `billing_items` - Line items
- `discounts` - Discount rules
- `discount_campaigns` - Campaign discounts
- `scholarships` - Financial aid
- `receipts` - Generated receipts