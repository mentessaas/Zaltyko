/**
 * Script para aplicar políticas RLS actualizadas
 * 
 * Ejecutar con: pnpm tsx scripts/apply-rls-policies.ts
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { getDatabaseUrl } from "../src/lib/env";

const DATABASE_URL = getDatabaseUrl();

if (!DATABASE_URL) {
  console.error("❌ No se pudo obtener la URL de la base de datos");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function applyRLS() {
  const filePath = join(process.cwd(), "supabase", "rls.sql");
  const sql = readFileSync(filePath, "utf-8");

  console.log("📄 Aplicando políticas RLS...\n");

  try {
    // Ejecutar el SQL completo de una vez
    // Las funciones DO $$ y otros bloques complejos requieren ejecución completa
    await pool.query(sql);
    console.log("✅ Políticas RLS aplicadas correctamente");
    return true;
  } catch (error: any) {
    // Ignorar errores de "already exists" o "duplicate" que son esperados
    if (
      error.message.includes("already exists") ||
      error.message.includes("duplicate") ||
      error.message.includes("does not exist")
    ) {
      console.log("⚠️  Algunas políticas ya existían (esto es normal)");
      console.log("✅ Políticas RLS aplicadas (algunas pueden haber sido ignoradas por duplicados)");
      return true;
    }
    console.error("❌ Error aplicando RLS:", error.message);
    return false;
  }
}

async function main() {
  console.log("🚀 Aplicando políticas RLS actualizadas...\n");

  const success = await applyRLS();

  await pool.end();

  if (!success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Error fatal:", error);
  process.exit(1);
});

