# Configuración para Producción - Zaltyko

Esta guía te ayudará a configurar Zaltyko para producción en Vercel.

## 📋 Variables de Entorno Requeridas

### Base de Datos

#### `DATABASE_URL_POOL` (Requerido para producción)
URL del Transaction Pooler de Supabase (puerto 6543). Recomendado para serverless/edge functions.

**Cómo obtenerla:**
1. Ve a [Supabase Dashboard](https://app.supabase.com/project/***REMOVED***?showConnect=true)
2. En "Connection String", cambia "Method" a "Transaction pooler"
3. Copia la URL completa (formato: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-[REGION].pooler.supabase.com:6543/postgres`)

#### `DATABASE_URL_DIRECT` (Opcional, para migraciones)
URL del Session Pooler (puerto 5432) o conexión directa. Usada para migraciones y scripts.

**Cómo obtenerla:**
1. Ve a [Supabase Dashboard](https://app.supabase.com/project/***REMOVED***?showConnect=true)
2. En "Connection String", cambia "Method" a "Session pooler"
3. Copia la URL completa

### Supabase

#### `NEXT_PUBLIC_SUPABASE_URL`
```
https://***REMOVED***.supabase.co
```

#### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZ3hmYWhzdnVnaWxidGhia2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MjU5MjgsImV4cCI6MjA3ODEwMTkyOH0.1AnSfOAxpt0eUJnHk5UG0AnwyEkgsfbjU8cR76E-wv8
```

#### `SUPABASE_SERVICE_ROLE_KEY` (Requerido)
**Cómo obtenerla:**
1. Ve a [Supabase Dashboard → Settings → API](https://app.supabase.com/project/***REMOVED***/settings/api)
2. Busca "service_role" en "Project API keys"
3. Copia el key (empieza con `eyJ...`)

⚠️ **IMPORTANTE:** Nunca expongas esta key en el frontend. Solo úsala en Server Actions y API routes.

### Aplicación

#### `NEXT_PUBLIC_APP_URL`
URL de tu aplicación en producción:
```
https://tu-dominio.com
```

#### `NODE_ENV`
```
production
```

### Opcionales (según funcionalidades usadas)

#### Stripe
- `STRIPE_SECRET_KEY`: Key de producción (empieza con `sk_live_...`)
- `STRIPE_WEBHOOK_SECRET`: Secret del webhook de producción

#### Lemon Squeezy
- `LEMONSQUEEZY_API_KEY`: API key de producción
- `LEMONSQUEEZY_WEBHOOK_SECRET`: Secret del webhook

#### Mailgun
- `MAILGUN_API_KEY`: API key de Mailgun
- `MAILGUN_DOMAIN`: Dominio verificado en Mailgun

#### Sentry (Recomendado)
- `NEXT_PUBLIC_SENTRY_DSN`: DSN público de Sentry
- `SENTRY_DSN`: DSN privado de Sentry
- `SENTRY_ORG`: Organización de Sentry
- `SENTRY_PROJECT`: Proyecto de Sentry
- `SENTRY_AUTH_TOKEN`: Token de autenticación de Sentry

#### Cron Jobs
- `CRON_SECRET`: Secret para proteger los cron jobs (generar con `openssl rand -base64 32`)

## 🚀 Configuración en Vercel

### 1. Agregar Variables de Entorno

1. Ve a tu proyecto en [Vercel Dashboard](https://vercel.com/dashboard)
2. Ve a **Settings → Environment Variables**
3. Agrega todas las variables listadas arriba
4. Asegúrate de seleccionar el entorno correcto (Production, Preview, Development)

### 2. Configurar Build Settings

- **Framework Preset:** Next.js
- **Build Command:** `pnpm build`
- **Install Command:** `pnpm install`
- **Output Directory:** `.next` (automático)

### 3. Configurar Dominio

1. Ve a **Settings → Domains**
2. Agrega tu dominio personalizado
3. Configura los registros DNS según las instrucciones de Vercel

### 4. Configurar Cron Jobs (si aplica)

1. Ve a **Settings → Cron Jobs**
2. Agrega los cron jobs necesarios:
   - Class Reminders: `0 8 * * *` (8:00 AM UTC)
   - Daily Alerts: `0 9 * * *` (9:00 AM UTC)

## ✅ Verificación Pre-Deploy

Antes de hacer deploy, verifica:

- [ ] Todas las variables de entorno están configuradas en Vercel
- [ ] `DATABASE_URL_POOL` apunta al Transaction Pooler (puerto 6543)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` está configurada
- [ ] `NEXT_PUBLIC_APP_URL` apunta a tu dominio de producción
- [ ] `NODE_ENV=production` está configurado
- [ ] Las migraciones están aplicadas en la base de datos de producción
- [ ] Las políticas RLS están aplicadas

## 🔧 Troubleshooting

### Error: "password authentication failed"

**Solución:**
1. Verifica que la contraseña en `DATABASE_URL_POOL` sea correcta
2. Si es necesario, resetea la contraseña en Supabase Dashboard → Settings → Database
3. Actualiza la URL con la nueva contraseña

### Error: "Tenant or user not found"

**Solución:**
1. Verifica que el formato del usuario sea `postgres.[PROJECT_REF]`
2. Asegúrate de usar la URL del pooler, no la conexión directa
3. Verifica que la región en la URL sea correcta

### Error: "getaddrinfo ENOTFOUND"

**Solución:**
1. Esto indica que la conexión directa requiere IPv6
2. Usa el pooler (Session o Transaction) en su lugar
3. El pooler es compatible con IPv4

## 📚 Recursos

- [Documentación de Vercel](https://vercel.com/docs)
- [Documentación de Supabase](https://supabase.com/docs)
- [Documentación de Next.js](https://nextjs.org/docs)

