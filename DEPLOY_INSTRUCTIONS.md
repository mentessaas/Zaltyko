# 🚀 Instrucciones de Deployment

## Opción 1: Deployment Automático (Recomendado)

Si tu repositorio ya está conectado a Vercel, simplemente haz push:

```bash
# Agregar cambios
git add .

# Commit
git commit -m "feat: preparación para producción"

# Push (Vercel hará deploy automáticamente)
git push origin main
```

Vercel detectará el push y hará el deployment automáticamente.

## Opción 2: Deployment con Token de API

Si prefieres hacer el deployment manualmente con la CLI:

### 1. Obtener Token de API

1. Ve a [Vercel Account Tokens](https://vercel.com/account/tokens)
2. Crea un nuevo token
3. Copia el token

### 2. Ejecutar Deployment

```bash
# Opción A: Usar el script
VERCEL_TOKEN=tu_token_aqui bash scripts/deploy-to-vercel.sh

# Opción B: Comandos manuales
export VERCEL_TOKEN=tu_token_aqui
pnpm vercel link --yes --project prj_tUepgxfFz4UMpxJ7PrCjWRC66GYT
pnpm vercel --prod --yes
```

## Opción 3: Deployment desde Vercel Dashboard

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard)
2. Selecciona tu proyecto
3. Ve a la pestaña "Deployments"
4. Haz clic en "Redeploy" en el último deployment
5. O haz clic en "Deploy" para un nuevo deployment

## ⚠️ IMPORTANTE: Configurar Variables de Entorno

**ANTES del primer deployment**, asegúrate de configurar las variables de entorno en Vercel:

1. Ve a Vercel Dashboard → Tu Proyecto → **Settings** → **Environment Variables**
2. Agrega todas las variables requeridas (ver `DEPLOY_NOW.md`)

### Variables Críticas:

```bash
DATABASE_URL_POOL=...
DATABASE_URL_DIRECT=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://tu-dominio.com
NODE_ENV=production
CRON_SECRET=<genera con: pnpm tsx scripts/generate-cron-secret.ts>
```

## 📋 Después del Deployment

1. Verifica que la aplicación carga correctamente
2. Verifica que los cron jobs estén activos (Settings → Cron Jobs)
3. Sigue el checklist en `docs/PRODUCTION_CHECKLIST.md`

## 🆘 Troubleshooting

### Error: "No credentials found"
- Ejecuta: `pnpm vercel login`
- O usa el token: `VERCEL_TOKEN=tu_token pnpm vercel --prod`

### Error: "Project not found"
- Verifica que el Project ID sea correcto: `prj_tUepgxfFz4UMpxJ7PrCjWRC66GYT`
- O vincula el proyecto: `pnpm vercel link`

### Build falla
- Revisa los logs en Vercel Dashboard
- Verifica que todas las variables de entorno estén configuradas
- Ejecuta `pnpm build` localmente para ver errores

## 📚 Documentación Adicional

- `DEPLOY_NOW.md` - Guía completa paso a paso
- `docs/PRODUCTION_CHECKLIST.md` - Checklist detallado
- `docs/DEPLOYMENT.md` - Documentación completa

