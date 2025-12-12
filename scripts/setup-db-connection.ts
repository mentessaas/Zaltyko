#!/usr/bin/env tsx
/**
 * Script para configurar automáticamente la conexión a la base de datos
 * usando la información disponible de Supabase
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

const projectRef = "***REMOVED***";
const supabaseUrl = `https://${projectRef}.supabase.co`;
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZ3hmYWhzdnVnaWxidGhia2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MjU5MjgsImV4cCI6MjA3ODEwMTkyOH0.1AnSfOAxpt0eUJnHk5UG0AnwyEkgsfbjU8cR76E-wv8";

const envLocalPath = resolve(process.cwd(), ".env.local");

console.log("🔧 Configurando conexión a la base de datos...\n");

// Leer el archivo actual si existe
let envContent = "";
if (existsSync(envLocalPath)) {
  envContent = readFileSync(envLocalPath, "utf-8");
}

// Construir el contenido del archivo .env.local
const newEnvContent = `# ============================================
# Base de Datos Supabase
# ============================================
# Para desarrollo, usa el pooler (transaction mode)
# Obtén la contraseña desde: https://app.supabase.com/project/${projectRef}/settings/database
# O haz clic en "Connect" en el dashboard
DATABASE_URL_POOL=postgresql://postgres.${projectRef}:[TU_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# Conexión directa (para migraciones y scripts)
DATABASE_URL_DIRECT=postgresql://postgres:[TU_PASSWORD]@db.${projectRef}.supabase.co:5432/postgres

# ============================================
# Supabase
# ============================================
NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_KEY]

# ============================================
# Aplicación
# ============================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# ============================================
# Notas
# ============================================
# Para obtener las credenciales faltantes:
# 1. Contraseña DB: https://app.supabase.com/project/${projectRef}/settings/database
# 2. Service Role Key: https://app.supabase.com/project/${projectRef}/settings/api
#    (Busca "service_role" en la sección de API keys)
`;

writeFileSync(envLocalPath, newEnvContent, "utf-8");

console.log("✅ Archivo .env.local actualizado\n");
console.log("⚠️  IMPORTANTE: Necesitas completar 2 valores:\n");
console.log("1. [TU_PASSWORD] - Contraseña de la base de datos");
console.log("   📍 Obtener desde: https://app.supabase.com/project/${projectRef}/settings/database");
console.log("   O haz clic en 'Connect' en el dashboard del proyecto\n");
console.log("2. [SERVICE_ROLE_KEY] - Service Role Key de Supabase");
console.log("   📍 Obtener desde: https://app.supabase.com/project/${projectRef}/settings/api");
console.log("   Busca la key 'service_role' (es secreta, empieza con 'eyJ...')\n");
console.log("💡 Una vez completadas, ejecuta: pnpm tsx scripts/check-env.ts");

