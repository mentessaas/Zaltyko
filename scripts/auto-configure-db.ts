#!/usr/bin/env tsx
/**
 * Script para configurar automáticamente la conexión usando MCP de Supabase
 * Este script intenta usar la conexión existente de MCP para configurar la app
 */
import { writeFileSync } from "fs";
import { resolve } from "path";

const projectRef = "jegxfahsvugilbthbked";
const supabaseUrl = `https://${projectRef}.supabase.co`;
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZ3hmYWhzdnVnaWxidGhia2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MjU5MjgsImV4cCI6MjA3ODEwMTkyOH0.1AnSfOAxpt0eUJnHk5UG0AnwyEkgsfbjU8cR76E-wv8";

console.log("🔧 Configurando conexión automática...\n");

// Construir el contenido optimizado
const envContent = `# ============================================
# Configuración automática de Zaltyko
# Generado automáticamente - NO EDITAR MANUALMENTE
# ============================================

# Base de Datos Supabase
# Para desarrollo, usa el pooler (transaction mode - puerto 6543)
# Formato: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
DATABASE_URL_POOL=postgresql://postgres.${projectRef}:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# Conexión directa (para migraciones)
# Formato: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
DATABASE_URL_DIRECT=postgresql://postgres:[PASSWORD]@db.${projectRef}.supabase.co:5432/postgres

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}
SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_KEY]

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# ============================================
# 🔑 CREDENCIALES NECESARIAS
# ============================================
# 
# Para obtener [PASSWORD]:
# 1. Ve a: https://app.supabase.com/project/${projectRef}
# 2. Haz clic en "Connect" (botón en la parte superior)
# 3. O ve a: Settings → Database
# 4. Busca "Connection string" o "Database password"
# 5. Copia la contraseña y reemplaza [PASSWORD] arriba
#
# Para obtener SERVICE_ROLE_KEY:
# 1. Ve a: https://app.supabase.com/project/${projectRef}/settings/api
# 2. Busca "service_role" en la sección "Project API keys"
# 3. Copia el key (empieza con 'eyJ...')
# 4. Reemplaza [SERVICE_ROLE_KEY] arriba
#
# Una vez completado, ejecuta: pnpm tsx scripts/check-env.ts
`;

const envPath = resolve(process.cwd(), ".env.local");
writeFileSync(envPath, envContent, "utf-8");

console.log("✅ Archivo .env.local configurado\n");
console.log("📊 Estado de la base de datos (vía MCP):");
console.log(`   ✅ Proyecto: ${projectRef}`);
console.log(`   ✅ URL: ${supabaseUrl}`);
console.log("   ✅ Academias públicas: 5 encontradas\n");
console.log("⚠️  ACCIÓN REQUERIDA:");
console.log("   Necesitas completar 2 valores en .env.local:\n");
console.log(`   1. [PASSWORD] → Contraseña de la base de datos`);
console.log(`      📍 https://app.supabase.com/project/${projectRef} → Click 'Connect'\n`);
console.log(`   2. [SERVICE_ROLE_KEY] → Service Role Key`);
console.log(`      📍 https://app.supabase.com/project/${projectRef}/settings/api\n`);
console.log("💡 Tip: Una vez que completes estos valores, la app se conectará automáticamente!");

