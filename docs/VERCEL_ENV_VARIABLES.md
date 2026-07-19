# 🔐 Configuración de Variables de Entorno en Vercel

## 📋 Guía Paso a Paso

### 1. Acceder a la Configuración del Proyecto

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecciona el proyecto **zaltyko** (o tu proyecto)
3. Ve a **Settings** → **Environment Variables**

### 2. Agregar Variables de Entorno

Haz clic en **Add New** y agrega cada variable una por una. Asegúrate de seleccionar los **environments** correctos (Production, Preview, Development).

#### 🔴 Variables Críticas (OBLIGATORIAS)

```bash
# Base de Datos
DATABASE_URL_POOL=postgresql://user:password@host:port/db?pgbouncer=true
DATABASE_URL_DIRECT=postgresql://user:password@host:port/db

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui

# App URL
NEXT_PUBLIC_APP_URL=https://tu-dominio.com

# Entorno
NODE_ENV=production

# Cron Secret (genera uno nuevo)
CRON_SECRET=tu-secret-aqui-generado-con-openssl
```

#### 🟡 Variables Opcionales pero Recomendadas

```bash
# Sentry (Error Tracking)
SENTRY_DSN=https://tu-dsn@sentry.io/proyecto
SENTRY_AUTH_TOKEN=tu-auth-token
SENTRY_ORG=tu-org
SENTRY_PROJECT=tu-proyecto
NEXT_PUBLIC_SENTRY_DSN=https://tu-dsn@sentry.io/proyecto

# Brevo (Emails transaccionales)
BREVO_API_KEY=tu-api-key
BREVO_SENDER_EMAIL=noreply@zaltyko.com
BREVO_SENDER_NAME=Zaltyko
BREVO_REPLY_TO=soporte@zaltyko.com

# Stripe (si usas Stripe)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Lemon Squeezy (si usas Lemon Squeezy)
LEMONSQUEEZY_API_KEY=tu-api-key
LEMONSQUEEZY_WEBHOOK_SECRET=tu-webhook-secret

# Otros
NEXT_PUBLIC_APP_NAME=Zaltyko
```

### 3. Generar CRON_SECRET

Ejecuta en tu terminal:

```bash
openssl rand -base64 32
```

O usa el script incluido:

```bash
pnpm tsx scripts/generate-cron-secret.ts
```

Copia el resultado y pégalo en `CRON_SECRET` en Vercel.

### 4. Verificar Variables

Después de agregar todas las variables:

1. Ve a **Settings** → **Environment Variables**
2. Verifica que todas las variables estén presentes
3. Asegúrate de que estén marcadas para **Production**

### 5. Redeploy

Después de agregar las variables:

1. Ve a **Deployments**
2. Haz clic en los **3 puntos** del último deployment
3. Selecciona **Redeploy**
4. O haz un nuevo push a tu repositorio

## ⚠️ Importante

- **NUNCA** compartas tus variables de entorno públicamente
- **NUNCA** hagas commit de `.env` o `.env.local` al repositorio
- Las variables están encriptadas en Vercel
- Cada environment (Production, Preview, Development) puede tener valores diferentes

## 🔍 Verificar Variables en Runtime

Puedes verificar que las variables estén configuradas correctamente creando un endpoint temporal:

```typescript
// src/app/api/debug/env/route.ts
export async function GET() {
  return Response.json({
    hasDatabaseUrl: !!process.env.DATABASE_URL_POOL,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasCronSecret: !!process.env.CRON_SECRET,
    // NO devuelvas los valores reales, solo si existen
  });
}
```

Luego visita: `https://tu-dominio.com/api/debug/env`

## 📚 Referencias

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
