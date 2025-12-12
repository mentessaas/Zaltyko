#!/usr/bin/env tsx
/**
 * Script para verificar que las variables de entorno estén correctamente configuradas
 */
import { config } from "dotenv";
import { resolve } from "path";
import { Pool } from "pg";

// Cargar específicamente .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const requiredVars = {
  DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

console.log("🔍 Verificando variables de entorno...\n");

let allOk = true;

for (const [key, value] of Object.entries(requiredVars)) {
  if (!value || value.includes("[TU_PASSWORD]") || value.includes("TU_SERVICE_ROLE_KEY_AQUI")) {
    console.log(`❌ ${key}: Faltante o incompleto`);
    allOk = false;
  } else {
    console.log(`✅ ${key}: Configurado`);
  }
}

if (!allOk) {
  console.log("\n⚠️  Faltan variables por completar.");
  console.log("\n📝 Para obtener las credenciales:");
  console.log("   1. Ve a: https://app.supabase.com/project/***REMOVED***/settings/database");
  console.log("   2. Haz clic en 'Connect' o busca 'Connection string'");
  console.log("   3. Copia la contraseña y reemplaza [TU_PASSWORD] en .env.local");
  console.log("   4. Para Service Role Key: https://app.supabase.com/project/***REMOVED***/settings/api");
  process.exit(1);
}

console.log("\n🔌 Probando conexión a la base de datos...\n");

(async () => {
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL_DIRECT,
      connectionTimeoutMillis: 5000,
    });

    const result = await pool.query(
      "SELECT COUNT(*) as total FROM academies WHERE is_public = true AND is_suspended = false"
    );

    console.log(`✅ Conexión exitosa!`);
    console.log(`📊 Academias públicas encontradas: ${result.rows[0].total}`);
    
    // Obtener algunas academias de ejemplo
    const academies = await pool.query(
      "SELECT name, city, country FROM academies WHERE is_public = true AND is_suspended = false LIMIT 3"
    );
    
    if (academies.rows.length > 0) {
      console.log("\n📋 Ejemplos de academias:");
      academies.rows.forEach((academy) => {
        console.log(`   - ${academy.name}${academy.city ? ` (${academy.city})` : ""}`);
      });
    }

    await pool.end();
    console.log("\n✅ ¡Todo está configurado correctamente!");
  } catch (error: any) {
    console.log(`❌ Error de conexión: ${error.message}`);
    console.log("\n💡 Posibles soluciones:");
    console.log("   - Verifica que la contraseña sea correcta");
    console.log("   - Asegúrate de que la URL de conexión sea correcta");
    console.log("   - Si usas IPv4, intenta con DATABASE_URL_POOL en su lugar");
    process.exit(1);
  }
})();

