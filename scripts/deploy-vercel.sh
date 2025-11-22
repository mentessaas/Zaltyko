#!/bin/bash

# ============================================
# Script de Deployment a Vercel
# ============================================

set -e

echo "🚀 Iniciando deployment a Vercel..."

# Verificar que Vercel CLI está instalado
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI no está instalado"
    echo "Instala con: npm install -g vercel"
    exit 1
fi

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ No se encontró package.json. Ejecuta este script desde la raíz del proyecto."
    exit 1
fi

echo "📋 Verificando configuración..."

# Verificar que vercel.json existe
if [ ! -f "vercel.json" ]; then
    echo "⚠️  vercel.json no encontrado. Creando..."
    cat > vercel.json << EOF
{
  "crons": [
    {
      "path": "/api/cron/class-reminders",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/daily-alerts",
      "schedule": "0 9 * * *"
    }
  ]
}
EOF
fi

echo "✅ Configuración verificada"
echo ""
echo "📝 IMPORTANTE: Asegúrate de tener configuradas estas variables de entorno en Vercel:"
echo ""
echo "OBLIGATORIAS:"
echo "  - DATABASE_URL"
echo "  - NEXT_PUBLIC_SUPABASE_URL"
echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "  - SUPABASE_SERVICE_ROLE_KEY"
echo "  - NEXTAUTH_URL"
echo "  - NEXTAUTH_SECRET"
echo "  - CRON_SECRET"
echo "  - NEXT_PUBLIC_APP_URL"
echo ""
echo "¿Continuar con el deployment? (y/n)"
read -r response

if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelado"
    exit 1
fi

echo ""
echo "🔐 Verificando login en Vercel..."
if ! vercel whoami &> /dev/null; then
    echo "⚠️  No estás logueado. Ejecutando vercel login..."
    vercel login
fi

echo ""
echo "📦 Iniciando deployment..."
echo ""

# Deploy a preview primero
echo "1️⃣  Deploy a preview..."
vercel

echo ""
echo "¿Deseas hacer deploy a producción? (y/n)"
read -r prod_response

if [[ "$prod_response" =~ ^[Yy]$ ]]; then
    echo ""
    echo "2️⃣  Deploy a producción..."
    vercel --prod
    echo ""
    echo "✅ Deployment a producción completado!"
else
    echo ""
    echo "✅ Deployment a preview completado!"
fi

echo ""
echo "📝 Próximos pasos:"
echo "1. Ve a Vercel Dashboard y configura las variables de entorno"
echo "2. Verifica que los cron jobs estén activos"
echo "3. Prueba la aplicación en producción"
echo ""
echo "🎉 ¡Listo!"

