# Deployment Guide

## Stack

| Service | Usage | URL |
|---------|-------|-----|
| **Vercel** | Hosting | vercel.com |
| **Supabase** | Database + Auth | supabase.com |
| **Stripe** | Payments | stripe.com |
| **Brevo** | Transactional email | brevo.com |
| **Vercel KV** | Rate limiting (Redis) | vercel.com/kv |

## Deployment Steps

### 1. Push to GitHub
```bash
git push origin main
```

### 2. Connect to Vercel
1. Go to vercel.com
2. Import repository
3. Configure environment variables
4. Deploy

### 3. Environment Variables in Vercel

Set all variables in Vercel Dashboard → Project → Settings → Environment Variables:

```bash
# Database
DATABASE_URL=postgresql://...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-domain.com

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Brevo)
BREVO_API_KEY=...

# AI (MiniMax)
MINIMAX_API_KEY=...

# Vercel KV
KV_REST_API_URL=https://xxx.kv.vercel-storage.com
KV_REST_API_TOKEN=...
```

### 4. Configure Stripe Webhooks

In Stripe Dashboard → Webhooks:
- Add endpoint: `https://your-domain.com/api/stripe/webhook`
- Subscribe to: `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`

### 5. Configure Domain

In Vercel Dashboard → Domains:
- Add custom domain (e.g., zaltyko.com)
- Update DNS records as instructed

## Production Checklist

- [ ] All env vars set in Vercel
- [ ] Stripe webhooks configured
- [ ] Brevo API key set
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Test payment flow
- [ ] Test email delivery

## Rollback

If something goes wrong:
1. Vercel Dashboard → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

## Related Docs

- [Setup Guide](../02-SETUP/SETUP.md)
- [Environment Variables](../02-SETUP/env-variables.md)
- [Database Schema](../08-DATABASE/schema.md)