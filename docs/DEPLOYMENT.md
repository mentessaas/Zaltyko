# Guía de Deployment en Vercel

Esta guía te ayudará a desplegar Zaltyko en producción usando Vercel.

## Prerrequisitos

1. **Cuenta de Vercel**: [vercel.com](https://vercel.com)
2. **Proyecto Supabase**: Configurado con base de datos PostgreSQL
3. **Cuenta de Stripe**: Para procesamiento de pagos (opcional)
4. **Cuenta de Mailgun**: Para envío de emails (opcional)
5. **Dominio**: Para producción (opcional pero recomendado)

## Paso 1: Preparar Supabase

### 1.1 Crear Connection Pool

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Database** → **Connection Pooling**
3. Crea un nuevo pool con:
   - **Mode**: Transaction
   - **Pool Size**: 20 (recomendado para producción)
4. Copia la URL del pool (formato: `postgresql://...?pgbouncer=true`)

### 1.2 Habilitar Realtime

1. Ve a **Database** → **Replication**
2. Habilita replicación para las siguientes tablas:
   - `profiles`
   - `subscriptions`
   - `academies`
   - `classes`
   - `class_sessions`
   - `billing_invoices`
   - `contact_messages`
   - `notifications`

### 1.3 Aplicar Políticas RLS

Ejecuta el archivo `supabase/rls.sql` en tu base de datos:

```bash
# Opción 1: Desde Supabase Dashboard
# Ve a SQL Editor y ejecuta el contenido de supabase/rls.sql

# Opción 2: Desde CLI
pnpm exec supabase db execute --db-url "$DATABASE_URL_DIRECT" --file supabase/rls.sql
```

### 1.4 Ejecutar Migraciones

Asegúrate de que todas las migraciones estén aplicadas:

```bash
pnpm db:migrate
```

## Paso 2: Configurar Variables de Entorno en Vercel

### 2.1 Variables Requeridas

Ve a tu proyecto en Vercel → **Settings** → **Environment Variables** y agrega:

#### Base de Datos
```
DATABASE_URL_POOL=postgresql://...?pgbouncer=true
DATABASE_URL_DIRECT=postgresql://... (sin pgbouncer)
```

#### Supabase
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Aplicación
```
NEXT_PUBLIC_APP_URL=https://your-domain.com
NODE_ENV=production
```

#### Stripe (Opcional)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### Mailgun (Opcional)
```
MAILGUN_API_KEY=your-api-key
MAILGUN_DOMAIN=mg.yourdomain.com
```

#### Lemon Squeezy (Opcional)
```
LEMONSQUEEZY_API_KEY=your-api-key
LEMONSQUEEZY_WEBHOOK_SECRET=your-webhook-secret
```

#### Cron Jobs (Requerido para producción)
```
CRON_SECRET=your-random-secret-string
```
**Importante**: Genera un secret aleatorio seguro. Puedes usar:
```bash
openssl rand -base64 32
```

#### Sentry (Opcional pero recomendado)
```
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=zaltyko
SENTRY_AUTH_TOKEN=your-auth-token
```

### 2.2 Configurar Variables por Entorno

- **Production**: Todas las variables con valores de producción
- **Preview**: Puedes usar valores de staging/testing
- **Development**: Variables locales en `.env.local`

## Paso 3: Configurar Webhooks

### 3.1 Stripe Webhook

1. Ve a [Stripe Dashboard](https://dashboard.stripe.com) → **Webhooks**
2. Crea un nuevo webhook con:
   - **URL**: `https://your-domain.com/api/stripe/webhook`
   - **Events**: Selecciona todos los eventos relacionados con suscripciones
3. Copia el **Signing Secret** y agrégalo como `STRIPE_WEBHOOK_SECRET`

### 3.2 Lemon Squeezy Webhook (si usas Lemon Squeezy)

1. Ve a [Lemon Squeezy Dashboard](https://app.lemonsqueezy.com) → **Settings** → **Webhooks**
2. Crea un nuevo webhook con:
   - **URL**: `https://your-domain.com/api/lemonsqueezy/webhook`
   - **Events**: Selecciona eventos de suscripción
3. Copia el **Signing Secret** y agrégalo como `LEMONSQUEEZY_WEBHOOK_SECRET`

## Paso 4: Deploy en Vercel

### 4.1 Conectar Repositorio

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard)
2. Haz clic en **Add New Project**
3. Conecta tu repositorio de GitHub/GitLab/Bitbucket
4. Selecciona el proyecto

### 4.2 Configurar Build

Vercel detectará automáticamente Next.js. Verifica que:

- **Framework Preset**: Next.js
- **Build Command**: `pnpm build` (o `npm run build`)
- **Output Directory**: `.next` (automático)
- **Install Command**: `pnpm install` (o `npm install`)

### 4.3 Configurar Dominio

1. Ve a **Settings** → **Domains**
2. Agrega tu dominio personalizado
3. Sigue las instrucciones para configurar DNS

### 4.4 Primer Deploy

1. Haz clic en **Deploy**
2. Espera a que el build complete
3. Revisa los logs para asegurarte de que no hay errores

## Paso 5: Post-Deployment

### 5.1 Verificar Funcionalidad

- [ ] Login/Registro funciona
- [ ] Dashboard carga correctamente
- [ ] Conexión a base de datos funciona
- [ ] Realtime notifications funcionan
- [ ] Webhooks de Stripe/Lemon Squeezy funcionan
- [ ] Emails se envían correctamente

### 5.2 Configurar Crons

Los crons están configurados en `vercel.json`:
- **Class Reminders**: 8:00 AM UTC diario (`/api/cron/class-reminders`)
- **Daily Alerts**: 9:00 AM UTC diario (`/api/cron/daily-alerts`)

**IMPORTANTE**: Asegúrate de configurar `CRON_SECRET` en las variables de entorno de Vercel. Los cron jobs verifican este secret para autenticar las solicitudes.

Para verificar que los crons funcionan:
1. Ve a Vercel Dashboard → Tu Proyecto → Settings → Cron Jobs
2. Verifica que los crons estén activos
3. Revisa los logs después de la primera ejecución

**Nota**: Los crons solo funcionan en producción. Para testing local, puedes hacer requests manuales con el header `Authorization: Bearer ${CRON_SECRET}`.

### 5.3 Monitoreo

1. Configura alertas en Vercel para errores de build
2. Configura monitoreo de errores (Sentry, LogRocket, etc.)
3. Revisa logs regularmente en Vercel Dashboard

## Troubleshooting

### Error: "DATABASE_URL_POOL must be set in production"

**Solución**: Asegúrate de que `DATABASE_URL_POOL` esté configurada en Vercel Environment Variables.

### Error: "Failed to connect to database"

**Solución**: 
1. Verifica que la URL del pool sea correcta
2. Verifica que el pool esté activo en Supabase
3. Verifica que las políticas RLS permitan conexiones

### Error: "Supabase client not initialized"

**Solución**: Verifica que `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` estén configuradas.

### Webhooks no funcionan

**Solución**:
1. Verifica que la URL del webhook sea correcta
2. Verifica que el secreto del webhook coincida
3. Revisa los logs en Vercel para ver errores

### Realtime no funciona

**Solución**:
1. Verifica que Realtime esté habilitado en Supabase Dashboard
2. Verifica que las tablas estén en la publicación `supabase_realtime`
3. Verifica las políticas RLS

## Checklist de Deployment

Antes de hacer deploy a producción:

- [ ] Todas las variables de entorno están configuradas
- [ ] Connection Pool está creado y activo
- [ ] Políticas RLS están aplicadas
- [ ] Migraciones están ejecutadas
- [ ] Realtime está habilitado
- [ ] Webhooks están configurados
- [ ] Dominio está configurado (si aplica)
- [ ] SSL está activo (automático en Vercel)
- [ ] Build pasa sin errores
- [ ] Tests pasan (si los hay)

## Optimizaciones de Producción

### Performance

- [ ] Connection Pool configurado correctamente
- [ ] Imágenes optimizadas con `next/image`
- [ ] Code splitting habilitado
- [ ] Caching configurado donde sea apropiado

### Seguridad

- [ ] Variables sensibles no están en el código
- [ ] RLS está habilitado en todas las tablas
- [ ] Headers de seguridad están configurados
- [ ] HTTPS está habilitado (automático en Vercel)

### Monitoreo

- [ ] Logging configurado
- [ ] Error tracking configurado
- [ ] Alertas configuradas
- [ ] Métricas de performance monitoreadas

## Recursos

- [Documentación de Vercel](https://vercel.com/docs)
- [Documentación de Next.js](https://nextjs.org/docs)
- [Documentación de Supabase](https://supabase.com/docs)
- [Documentación de Stripe](https://stripe.com/docs)

