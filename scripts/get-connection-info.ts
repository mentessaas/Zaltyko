#!/usr/bin/env tsx
/**
 * Script para obtener información de conexión desde Supabase Dashboard
 * Este script te guiará paso a paso para obtener las credenciales
 */
console.log("🔍 Guía para obtener las credenciales de conexión\n");
console.log("═══════════════════════════════════════════════════\n");
console.log("📋 PASO 1: Obtener la contraseña de la base de datos\n");
console.log("   1. Abre: https://app.supabase.com/project/***REMOVED***");
console.log("   2. Haz clic en el botón 'Connect' (parte superior del dashboard)");
console.log("   3. O ve a: Settings → Database");
console.log("   4. Busca la sección 'Connection string'");
console.log("   5. Copia la contraseña que aparece después de 'postgres:'");
console.log("   6. Reemplaza [PASSWORD] en .env.local con esa contraseña\n");
console.log("📋 PASO 2: Obtener el Service Role Key\n");
console.log("   1. Ve a: https://app.supabase.com/project/***REMOVED***/settings/api");
console.log("   2. Busca 'Project API keys'");
console.log("   3. Encuentra la key 'service_role' (es secreta)");
console.log("   4. Haz clic en 'Reveal' o 'Show' para verla");
console.log("   5. Copia el key completo (empieza con 'eyJ...')");
console.log("   6. Reemplaza [SERVICE_ROLE_KEY] en .env.local\n");
console.log("💡 TIP: Una vez que completes estos pasos, ejecuta:");
console.log("   pnpm tsx scripts/check-env.ts\n");
