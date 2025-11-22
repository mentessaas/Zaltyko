# 🚀 Guía de Deployment en Vercel

Esta guía te ayudará a desplegar Zaltyko SaaS en Vercel paso a paso.

## 📋 Prerequisitos

- [ ] Cuenta de Vercel (gratuita o Pro)
- [ ] Proyecto de Supabase configurado
- [ ] Base de datos PostgreSQL (Supabase)
- [ ] Variables de entorno listas

---

## 🚀 Opción 1: Deployment desde GitHub (Recomendado)

### Paso 1: Subir Código a GitHub

```bash
# Si aún no tienes un repositorio
git init
git add .
git commit -m "Initial commit - Zaltyko SaaS"
git branch -M main
git remote add origin https://github.com/tu-usuario/zaltyko-saas.git
git push -u origin main
```

### Paso 2: Conectar con Vercel

1. Ve a [vercel.com](https://vercel.com) e inicia sesión
2. Click en **"Add New Project"**
3. Importa tu repositorio de GitHub
4. Vercel detectará automáticamente que es un proyecto Next.js

### Paso 3: Configurar Variables de Entorno

En la pantalla de configuración del proyecto, agrega todas las variables de entorno:

**Variables Requeridas:**

```bash
# Base de Datos
DATABASE_URL=postgresql://...
# O
DATABASE_URL_DIRECT=postgresql://...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# NextAuth
NEXTAUTH_URL=https://tu-app.vercel.app
NEXTAUTH_SECRET=genera-con-openssl-rand-base64-32

# Mailgun
MAILGUN_API_KEY=key-xxx
MAILGUN_DOMAIN=tu-dominio.com
MAILGUN_FROM_EMAIL=noreply@tu-dominio.com

# Vercel Cron
CRON_SECRET=genera-con-openssl-rand-base64-32

# URLs
NEXT_PUBLIC_APP_URL=https://tu-app.vercel.app
```

**Generar Secretos:**

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# CRON_SECRET
openssl rand -base64 32
```

### Paso 4: Configurar Build Settings

Vercel debería detectar automáticamente:
- **Framework Preset:** Next.js
- **Build Command:** `pnpm build` (o `npm run build`)
- **Output Directory:** `.next`
- **Install Command:** `pnpm install` (o `npm install`)

Si usas pnpm, asegúrate de que esté configurado:
- En **Settings** → **General** → **Package Manager**: Selecciona `pnpm`

### Paso 5: Deploy

1. Click en **"Deploy"**
2. Espera a que el build complete
3. Tu app estará disponible en `https://tu-proyecto.vercel.app`

---

## 🚀 Opción 2: Deployment desde CLI

### Paso 1: Instalar Vercel CLI

```bash
npm i -g vercel
# o
pnpm add -g vercel
```

### Paso 2: Login

```bash
vercel login
```

### Paso 3: Deploy

```bash
# Desde la raíz del proyecto
cd "/Users/elvisvaldesinerarte/Desktop/Proyectos SaaS/Zaltyko SaaS"

# Deploy a preview
vercel

# Deploy a producción
vercel --prod
```

### Paso 4: Configurar Variables de Entorno

```bash
# Agregar variables una por una
vercel env add DATABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add NEXTAUTH_URL
vercel env add NEXTAUTH_SECRET
vercel env add MAILGUN_API_KEY
vercel env add MAILGUN_DOMAIN
vercel env add MAILGUN_FROM_EMAIL
vercel env add CRON_SECRET
vercel env add NEXT_PUBLIC_APP_URL

# O agregar todas desde un archivo
vercel env pull .env.local
# Edita .env.local y luego:
vercel env push
```

---

## ⚙️ Configuración Post-Deployment

### 1. Verificar Cron Jobs

1. Ve a **Vercel Dashboard** → Tu Proyecto → **Settings** → **Cron Jobs**
2. Verifica que aparezcan:
   - `/api/cron/class-reminders` - Diario a las 8:00 AM
   - `/api/cron/daily-alerts` - Diario a las 9:00 AM

### 2. Configurar Dominio Personalizado (Opcional)

1. Ve a **Settings** → **Domains**
2. Agrega tu dominio personalizado
3. Configura los registros DNS según las instrucciones

### 3. Verificar Variables de Entorno

1. Ve a **Settings** → **Environment Variables**
2. Verifica que todas las variables estén configuradas
3. Asegúrate de que estén disponibles para:
   - ✅ Production
   - ✅ Preview
   - ✅ Development (si aplica)

### 4. Configurar Supabase

Asegúrate de que en Supabase:

1. **Storage:** Bucket `uploads` creado ✅
2. **Realtime:** Habilitado para `notifications` ✅
3. **RLS Policies:** Todas configuradas ✅
4. **URLs permitidas:** Agrega tu dominio de Vercel en:
   - Supabase Dashboard → **Settings** → **API** → **URL Configuration**

---

## 🔍 Verificación Post-Deployment

### 1. Verificar Build

```bash
# Revisar logs del deployment
vercel logs

# O en el dashboard
# Vercel Dashboard → Deployments → [Último deployment] → Build Logs
```

### 2. Probar Endpoints

```bash
# Health check (si tienes uno)
curl https://tu-app.vercel.app/api/health

# Verificar que la app carga
curl https://tu-app.vercel.app
```

### 3. Probar Funcionalidades

- [ ] Login funciona
- [ ] Upload de archivos funciona
- [ ] Notificaciones en tiempo real funcionan
- [ ] Emails se envían correctamente

---

## 🐛 Troubleshooting

### Error: "Module not found"

**Solución:**
- Verifica que `package.json` tenga todas las dependencias
- Asegúrate de que el package manager esté configurado correctamente
- Revisa los logs de build en Vercel

### Error: "Environment variable not found"

**Solución:**
- Verifica que todas las variables estén en Vercel Dashboard
- Asegúrate de que estén disponibles para el entorno correcto (Production/Preview)
- Reinicia el deployment después de agregar variables

### Error: "Database connection failed"

**Solución:**
- Verifica que `DATABASE_URL` esté correcta
- Asegúrate de que la IP de Vercel esté permitida en Supabase
- En Supabase: **Settings** → **Database** → **Connection Pooling**

### Cron Jobs no se ejecutan

**Solución:**
1. Verifica que `vercel.json` esté en la raíz
2. Verifica que `CRON_SECRET` esté configurada
3. Revisa los logs en **Vercel Dashboard** → **Functions** → **Cron Jobs**
4. Los cron jobs se activan después del primer deployment exitoso

### Uploads fallan

**Solución:**
- Verifica que `SUPABASE_SERVICE_ROLE_KEY` esté configurada
- Verifica que el bucket `uploads` exista en Supabase
- Revisa las políticas RLS de Storage

---

## 📊 Monitoreo

### Logs en Vercel

```bash
# Ver logs en tiempo real
vercel logs --follow

# Ver logs de una función específica
vercel logs --function=api/upload
```

### Analytics

1. Ve a **Vercel Dashboard** → **Analytics**
2. Activa Analytics (requiere plan Pro)
3. Monitorea:
   - Performance
   - Web Vitals
   - Errores

---

## 🔄 Actualizaciones Futuras

### Deploy Automático

Con GitHub conectado, cada push a `main` desplegará automáticamente a producción.

### Preview Deployments

Cada pull request genera un preview deployment automático.

### Rollback

Si algo sale mal:
1. Ve a **Deployments**
2. Encuentra el deployment anterior que funcionaba
3. Click en **"..."** → **"Promote to Production"**

---

## ✅ Checklist Final

- [ ] Código subido a GitHub
- [ ] Proyecto conectado en Vercel
- [ ] Todas las variables de entorno configuradas
- [ ] Build exitoso
- [ ] Dominio configurado (opcional)
- [ ] Cron jobs verificados
- [ ] Supabase configurado
- [ ] Funcionalidades probadas
- [ ] Monitoreo configurado

---

## 🎉 ¡Listo!

Tu aplicación debería estar funcionando en producción. Si encuentras algún problema, revisa los logs en Vercel Dashboard o usa `vercel logs`.

**URL de tu app:** `https://tu-proyecto.vercel.app`

