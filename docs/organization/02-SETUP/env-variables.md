# Environment Variables

## Required Variables

### Database
```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
```

### Supabase
```env
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Authentication
```env
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000  # Production: https://zaltyko.com
```

### Stripe
```env
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Email (Brevo)
```env
BREVO_API_KEY=your-brevo-api-key
```

### AI (MiniMax)
```env
MINIMAX_API_KEY=your-minimax-api-key
```

### Vercel KV (Rate Limiting)
```env
KV_REST_API_URL=https://xxx.kv.vercel-storage.com
KV_REST_API_TOKEN=your-kv-token
```

### Analytics (Optional)
```env
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
NEXT_PUBLIC_DISABLE_ANALYTICS=true  # Set to "false" to enable
```

## Development Only
```env
# Used for testing rate limiting
RATE_LIMIT_TEST_SECRET=dev-secret
```

## How to Get These

### Supabase
1. Create project at supabase.com
2. Get from Project Settings > API

### Stripe
1. Create account at stripe.com
2. Get from Developers > API keys
3. Set up webhook endpoint for `invoice.paid`, `customer.subscription.updated`

### Brevo
1. Create account at brevo.com
2. Get API key from Settings > SMTP & API

### MiniMax
1. Create account at minimax.chat
2. Get API key from Dashboard