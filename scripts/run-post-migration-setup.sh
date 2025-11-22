#!/bin/bash

# ============================================
# Script para Ejecutar Configuración Post-Migración
# ============================================
# Este script ejecuta la configuración de Supabase
# después de aplicar las migraciones de Drizzle
# ============================================

set -e

echo "🚀 Ejecutando configuración post-migración de Supabase..."

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

echo "📋 Ejecutando script post-migración..."
supabase db execute --file supabase/post-migration-setup.sql

echo "✅ Configuración post-migración completada!"
echo ""
echo "📝 Verifica el resultado en Supabase Dashboard → SQL Editor → History"

