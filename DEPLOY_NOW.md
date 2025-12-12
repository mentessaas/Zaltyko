# 🚀 Deploy Ahora - Guía Rápida

## ✅ Estado: Todo está listo para producción

He preparado todo lo necesario. Ahora solo necesitas seguir estos pasos:

## 📋 Paso 1: Configurar Variables de Entorno en Vercel

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecciona tu proyecto (o crea uno nuevo)
3. Ve a **Settings** → **Environment Variables**
4. Agrega las siguientes variables:

### 🔴 Variables REQUERIDAS:

```bash
# Base de Datos
DATABASE_URL_POOL=postgresql://...?pgbouncer=true
DATABASE_URL_DIRECT=postgresql://... (sin pgbouncer)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Aplicación
NEXT_PUBLIC_APP_URL=https://tu-dominio.com
NODE_ENV=production

# Cron Jobs
CRON_SECRET=<genera con: pnpm tsx scripts/generate-cron-secret.ts>
```

### 🟡 Variables OPCIONALES (pero recomendadas):

```bash
# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ORG=tu-org
SENTRY_PROJECT=zaltyko
SENTRY_AUTH_TOKEN=xxx

# Stripe (si usas)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Lemon Squeezy (si usas)
LEMONSQUEEZY_API_KEY=...
LEMONSQUEEZY_WEBHOOK_SECRET=...

# Mailgun (si usas)
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=mg.tudominio.com
```

## 📋 Paso 2: Preparar Supabase

### 2.1 Crear Connection Pool

1. Ve a [Supabase Dashboard](https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a **Database** → **Connection Pooling**
4. Crea un nuevo pool:
   - **Mode**: Transaction
   - **Pool Size**: 20
5. Copia la URL del pool → `DATABASE_URL_POOL`

### 2.2 Ejecutar Migraciones

```bash
pnpm db:migrate
```

### 2.3 Aplicar Políticas RLS

1. Ve a Supabase Dashboard → **SQL Editor**
2. Abre el archivo `supabase/rls.sql`
3. Copia y pega el contenido
4. Ejecuta el script

### 2.4 Habilitar Realtime

1. Ve a **Database** → **Replication**
2. Habilita replicación para:
   - `profiles`
   - `subscriptions`
   - `academies`
   - `classes`
   - `class_sessions`
   - `billing_invoices`
   - `contact_messages`
   - `notifications`

## 📋 Paso 3: Configurar Webhooks

### Stripe Webhook (si usas Stripe)

1. Ve a [Stripe Dashboard](https://dashboard.stripe.com) → **Webhooks**
2. Crea nuevo webhook:
   - **URL**: `https://tu-dominio.com/api/stripe/webhook`
   - **Events**: Selecciona eventos de suscripción
3. Copia el **Signing Secret** → `STRIPE_WEBHOOK_SECRET`

### Lemon Squeezy Webhook (si usas Lemon Squeezy)

1. Ve a [Lemon Squeezy Dashboard](https://app.lemonsqueezy.com) → **Settings** → **Webhooks**
2. Crea nuevo webhook:
   - **URL**: `https://tu-dominio.com/api/lemonsqueezy/webhook`
   - **Events**: Selecciona eventos de suscripción
3. Copia el **Signing Secret** → `LEMONSQUEEZY_WEBHOOK_SECRET`

## 📋 Paso 4: Hacer Deploy

### Opción A: Deploy Automático (si Vercel está conectado)

1. Haz push a tu repositorio:
   ```bash
   git add .
   git commit -m "Ready for production"
   git push origin main
   ```

2. Vercel detectará el push y hará deploy automáticamente

### Opción B: Deploy Manual

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecciona tu proyecto
3. Haz clic en **Deploy**
4. Espera a que el build complete

## 📋 Paso 5: Verificar Deployment

Después del deploy, verifica:

- [ ] La aplicación carga correctamente
- [ ] Login/Registro funciona
- [ ] Dashboard carga
- [ ] Conexión a base de datos funciona
- [ ] Realtime notifications funcionan

## 📋 Paso 6: Verificar Cron Jobs

1. Ve a Vercel Dashboard → **Settings** → **Cron Jobs**
2. Verifica que estén activos:
   - Class Reminders: `0 8 * * *`
   - Daily Alerts: `0 9 * * *`
3. Espera a la primera ejecución y revisa los logs

## 🆘 Si algo falla

1. **Revisa los logs en Vercel Dashboard**
2. **Verifica variables de entorno** - Asegúrate de que todas estén configuradas
3. **Revisa Sentry** - Errores aparecerán ahí si está configurado
4. **Consulta docs/DEPLOYMENT.md** - Tiene sección de troubleshooting

## 📚 Documentación Completa

- **Checklist detallado**: `docs/PRODUCTION_CHECKLIST.md`
- **Guía completa**: `docs/DEPLOYMENT.md`
- **Resumen**: `docs/PRODUCTION_READY.md`

## ✨ ¡Listo!

Una vez completados estos pasos, tu aplicación estará en producción.

**Tiempo estimado**: 15-30 minutos

