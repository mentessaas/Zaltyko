#!/bin/bash

# ============================================
# Script de Configuración de Supabase
# ============================================
# Este script ayuda a configurar Supabase desde la línea de comandos
# Requiere: Supabase CLI instalado
# ============================================

set -e

echo "🚀 Configurando Supabase..."

# Verificar que Supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI no está instalado"
    echo "Instala con: npm install -g supabase"
    exit 1
fi

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ No se encontró package.json. Ejecuta este script desde la raíz del proyecto."
    exit 1
fi

echo "📦 Configurando Storage..."
supabase db execute --file supabase/storage-setup.sql

echo "🔔 Configurando Realtime..."
supabase db execute --file supabase/realtime-setup.sql

echo "🔒 Configurando Políticas RLS..."
supabase db execute --file supabase/rls-policies.sql

echo "✅ Configuración completada!"
echo ""
echo "📝 Próximos pasos:"
echo "1. Verifica en Supabase Dashboard que el bucket 'uploads' existe"
echo "2. Verifica que Realtime está habilitado para la tabla 'notifications'"
echo "3. Prueba subir un archivo usando el endpoint /api/upload"
echo "4. Prueba las notificaciones en tiempo real"

