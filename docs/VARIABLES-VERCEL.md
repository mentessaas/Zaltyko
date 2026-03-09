# 🔐 Variables de Entorno para Vercel

Copia y pega estas variables en **Vercel Dashboard** → **Settings** → **Environment Variables**

## ✅ Variables OBLIGATORIAS

```bash
# Base de Datos
DATABASE_URL=postgresql://user:password@host:5432/database

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# NextAuth
NEXTAUTH_URL=https://tu-proyecto.vercel.app
NEXTAUTH_SECRET=GENERA_CON_OPENSSL_RAND_BASE64_32

# Vercel Cron
CRON_SECRET=GENERA_CON_OPENSSL_RAND_BASE64_32

# App URL
NEXT_PUBLIC_APP_URL=https://tu-proyecto.vercel.app
```

## 📧 Variables OPCIONALES (pero recomendadas)

```bash
# Mailgun (para emails)
MAILGUN_API_KEY=key-xxx
MAILGUN_DOMAIN=tu-dominio.com
MAILGUN_FROM_EMAIL=noreply@tu-dominio.com

# Stripe (si usas Stripe)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Lemon Squeezy (si usas Lemon Squeezy)
LEMONSQUEEZY_API_KEY=xxx
LEMONSQUEEZY_WEBHOOK_SECRET=xxx
```

## 🔑 Generar Secretos

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# CRON_SECRET
openssl rand -base64 32
```

## 📝 Notas

- **NEXTAUTH_URL**: Debe ser la URL completa de tu app en Vercel (ej: `https://zaltyko.vercel.app`)
- **NEXT_PUBLIC_APP_URL**: Misma URL que NEXTAUTH_URL
- **CRON_SECRET**: Se usa para proteger los endpoints de cron jobs
- Todas las variables `NEXT_PUBLIC_*` son públicas y se exponen al cliente
- Las demás son privadas y solo accesibles en el servidor

## ✅ Checklist

- [ ] Todas las variables obligatorias configuradas
- [ ] Secretos generados con `openssl rand -base64 32`
- [ ] Variables disponibles para **Production**, **Preview** y **Development**
- [ ] URLs actualizadas con el dominio real de Vercel

