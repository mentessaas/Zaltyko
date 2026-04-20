# Setup Local Development

## Requirements

- Node.js 18+
- pnpm 8+
- Supabase account (local or cloud)
- Stripe account (for billing)

## Installation

```bash
# 1. Clone repository
git clone https://github.com/mentessaas/Zaltyko.git
cd Zaltyko

# 2. Install dependencies
pnpm install

# 3. Copy environment file
cp .env.example .env.local

# 4. Edit .env.local with your values (see env-variables.md)

# 5. Generate database migrations
pnpm db:generate

# 6. Push schema to database
pnpm db:migrate

# 7. (Optional) Seed initial data
pnpm db:seed

# 8. Start development server
pnpm dev
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (http://localhost:3000) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | ESLint check |
| `pnpm typecheck` | TypeScript check |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Push schema to database |
| `pnpm db:studio` | Open Drizzle Studio (DB browser) |
| `pnpm db:seed` | Seed database |

## Environment Variables

See [Environment Variables](./env-variables.md) for complete list.

## Troubleshooting

### Port already in use
```bash
pkill -f "next dev" && pnpm dev
```

### Database connection error
Check `DATABASE_URL` in `.env.local`. Make sure Supabase is running.

### Build errors
```bash
pnpm typecheck  # Check for type errors
pnpm lint       # Check for linting errors
```