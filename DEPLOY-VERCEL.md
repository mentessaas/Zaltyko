# 🚀 Deployment Rápido a Vercel

## Opción 1: Desde Vercel Dashboard (Más Fácil)

### Paso 1: Subir a GitHub (si no lo has hecho)

```bash
cd "/Users/elvisvaldesinerarte/Desktop/Proyectos SaaS/Zaltyko SaaS"

# Si no tienes git inicializado
git init
git add .
git commit -m "Ready for Vercel deployment"

# Si ya tienes repo
git add .
git commit -m "Update: Ready for production"
git push
```

### Paso 2: Conectar con Vercel

1. Ve a [vercel.com](https://vercel.com) e inicia sesión
2. Click en **"Add New Project"**
3. Importa tu repositorio de GitHub
4. Vercel detectará automáticamente Next.js

### Paso 3: Configurar Variables de Entorno

En la pantalla de configuración, agrega estas variables:

**OBLIGATORIAS:**
```
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXTAUTH_URL=https://tu-proyecto.vercel.app
NEXTAUTH_SECRET=genera-con-openssl-rand-base64-32
CRON_SECRET=genera-con-openssl-rand-base64-32
NEXT_PUBLIC_APP_URL=https://tu-proyecto.vercel.app
```

**OPCIONALES (pero recomendadas):**
```
MAILGUN_API_KEY=key-xxx
MAILGUN_DOMAIN=tu-dominio.com
MAILGUN_FROM_EMAIL=noreply@tu-dominio.com
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

**Generar secretos:**
```bash
openssl rand -base64 32  # Para NEXTAUTH_SECRET
openssl rand -base64 32  # Para CRON_SECRET
```

### Paso 4: Configurar Build

- **Framework Preset:** Next.js (auto-detectado)
- **Build Command:** `pnpm build` (o `npm run build`)
- **Output Directory:** `.next` (auto)
- **Install Command:** `pnpm install` (o `npm install`)

**IMPORTANTE:** En Settings → General → Package Manager, selecciona `pnpm`

### Paso 5: Deploy

Click en **"Deploy"** y espera a que termine.

---

## Opción 2: Desde CLI (Rápido)

### Paso 1: Login

```bash
cd "/Users/elvisvaldesinerarte/Desktop/Proyectos SaaS/Zaltyko SaaS"
vercel login
```

### Paso 2: Deploy Inicial

```bash
vercel
```

Esto te pedirá:
- ¿Set up and deploy? → **Yes**
- ¿Which scope? → Tu cuenta
- ¿Link to existing project? → **No** (primera vez)
- ¿Project name? → `zaltyko-saas` (o el que prefieras)
- ¿Directory? → `./` (raíz)

### Paso 3: Configurar Variables de Entorno

```bash
# Agregar variables una por una
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXTAUTH_URL production
vercel env add NEXTAUTH_SECRET production
vercel env add CRON_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production

# Opcionales
vercel env add MAILGUN_API_KEY production
vercel env add MAILGUN_DOMAIN production
vercel env add MAILGUN_FROM_EMAIL production
```

### Paso 4: Deploy a Producción

```bash
vercel --prod
```

---

## ✅ Verificación Post-Deployment

### 1. Verificar que la app carga
Visita: `https://tu-proyecto.vercel.app`

### 2. Verificar Cron Jobs
1. Ve a Vercel Dashboard → Tu Proyecto → **Settings** → **Cron Jobs**
2. Deberías ver:
   - `/api/cron/class-reminders` - Diario 8:00 AM
   - `/api/cron/daily-alerts` - Diario 9:00 AM

### 3. Verificar Variables de Entorno
1. Ve a **Settings** → **Environment Variables**
2. Verifica que todas estén configuradas para **Production**

### 4. Probar Funcionalidades
- [ ] Login funciona
- [ ] La app carga correctamente
- [ ] No hay errores en la consola

---

## 🔧 Comandos Útiles

```bash
# Ver logs en tiempo real
vercel logs --follow

# Ver información del proyecto
vercel inspect

# Listar deployments
vercel ls

# Abrir dashboard
vercel dashboard
```

---

## 📝 Checklist Pre-Deployment

- [x] Código en GitHub (o listo para subir)
- [ ] Variables de entorno preparadas
- [ ] Supabase configurado (Storage, Realtime, RLS)
- [ ] Base de datos con migraciones aplicadas
- [ ] `vercel.json` configurado (ya está ✅)
- [ ] `.env.example` creado (ya está ✅)

---

## 🎉 ¡Listo!

Una vez desplegado, tu app estará en:
**https://tu-proyecto.vercel.app**

Para más detalles, consulta `docs/VERCEL-DEPLOYMENT.md`

