#!/bin/bash
# Script para preparar el deployment a producción
# Ejecuta: bash scripts/prepare-deployment.sh

set -e

echo "🚀 Preparando deployment a producción..."
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verificar que estamos en la rama correcta
echo "📋 Verificando rama actual..."
CURRENT_BRANCH=$(git branch --show-current)
echo "   Rama actual: $CURRENT_BRANCH"
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo -e "${YELLOW}⚠️  No estás en main/master. ¿Continuar? (y/n)${NC}"
    read -r response
    if [ "$response" != "y" ]; then
        echo "❌ Cancelado"
        exit 1
    fi
fi

# 2. Verificar que no hay cambios sin commitear
echo ""
echo "📋 Verificando cambios sin commitear..."
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  Hay cambios sin commitear:${NC}"
    git status --short
    echo ""
    echo -e "${YELLOW}¿Deseas commitear estos cambios? (y/n)${NC}"
    read -r response
    if [ "$response" = "y" ]; then
        echo "📝 Ingresa el mensaje de commit:"
        read -r commit_message
        git add .
        git commit -m "$commit_message"
    fi
fi

# 3. Ejecutar verificación de producción
echo ""
echo "✅ Ejecutando verificación de producción..."
pnpm verify:production

# 4. Ejecutar lint
echo ""
echo "🔍 Ejecutando lint..."
if pnpm lint; then
    echo -e "${GREEN}✅ Lint pasado${NC}"
else
    echo -e "${YELLOW}⚠️  Hay errores de lint. ¿Continuar de todas formas? (y/n)${NC}"
    read -r response
    if [ "$response" != "y" ]; then
        echo "❌ Cancelado"
        exit 1
    fi
fi

# 5. Generar CRON_SECRET si no existe
echo ""
echo "🔐 Generando CRON_SECRET..."
CRON_SECRET=$(pnpm tsx scripts/generate-cron-secret.ts 2>&1 | grep -v "🔐\|📋\|^$" | head -1)
echo "   CRON_SECRET generado: $CRON_SECRET"
echo ""
echo "📋 IMPORTANTE: Copia este CRON_SECRET y agrégalo como variable de entorno en Vercel"

# 6. Resumen
echo ""
echo "=========================================="
echo "✅ Preparación completada"
echo "=========================================="
echo ""
echo "📋 Próximos pasos:"
echo ""
echo "1. Configura variables de entorno en Vercel:"
echo "   - Ve a Vercel Dashboard → Tu Proyecto → Settings → Environment Variables"
echo "   - Agrega todas las variables requeridas (ver docs/DEPLOYMENT.md)"
echo "   - CRON_SECRET: $CRON_SECRET"
echo ""
echo "2. Haz push a tu repositorio:"
echo "   git push origin $CURRENT_BRANCH"
echo ""
echo "3. Si Vercel está conectado, el deploy se iniciará automáticamente"
echo "   O ve a Vercel Dashboard y haz clic en 'Deploy'"
echo ""
echo "4. Después del deploy, sigue el checklist en docs/PRODUCTION_CHECKLIST.md"
echo ""

