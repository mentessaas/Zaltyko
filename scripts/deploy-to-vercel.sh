#!/bin/bash
# Script para hacer deployment a Vercel
# Uso: VERCEL_TOKEN=tu_token bash scripts/deploy-to-vercel.sh

set -e

echo "🚀 Iniciando deployment a Vercel..."
echo ""

# Verificar que el token esté configurado
if [ -z "$VERCEL_TOKEN" ]; then
    echo "❌ Error: VERCEL_TOKEN no está configurado"
    echo ""
    echo "Para obtener tu token:"
    echo "1. Ve a https://vercel.com/account/tokens"
    echo "2. Crea un nuevo token"
    echo "3. Ejecuta: VERCEL_TOKEN=tu_token bash scripts/deploy-to-vercel.sh"
    echo ""
    exit 1
fi

# Project ID
PROJECT_ID="prj_tUepgxfFz4UMpxJ7PrCjWRC66GYT"

echo "📋 Configurando proyecto..."
pnpm vercel link --yes --token "$VERCEL_TOKEN" --project "$PROJECT_ID" || {
    echo "⚠️  No se pudo vincular el proyecto, continuando con deploy..."
}

echo ""
echo "🔨 Haciendo build..."
pnpm build

echo ""
echo "🚀 Desplegando a producción..."
pnpm vercel --prod --yes --token "$VERCEL_TOKEN"

echo ""
echo "✅ Deployment completado!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Verifica el deployment en Vercel Dashboard"
echo "2. Configura las variables de entorno si aún no lo has hecho"
echo "3. Verifica que los cron jobs estén activos"
echo "4. Sigue el checklist en docs/PRODUCTION_CHECKLIST.md"

