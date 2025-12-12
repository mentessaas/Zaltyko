/**
 * Script para aplicar migraciones del módulo de Directorio Público de Academias
 * 
 * Ejecutar con: pnpm tsx scripts/apply-public-academies-migrations.ts
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

async function applyMigration(fileName: string) {
  const filePath = join(process.cwd(), "drizzle", fileName);
  const sql = readFileSync(filePath, "utf-8");

  console.log(`\n📄 Aplicando migración: ${fileName}...`);

  try {
    await pool.query(sql);
    console.log(`✅ Migración ${fileName} aplicada correctamente`);
    return true;
  } catch (error: any) {
    if (error.message.includes("already exists") || error.message.includes("duplicate")) {
      console.log(`⚠️  Migración ${fileName} ya estaba aplicada (ignorando)`);
      return true;
    }
    console.error(`❌ Error aplicando ${fileName}:`, error.message);
    return false;
  }
}

async function main() {
  console.log("🚀 Aplicando migraciones del Directorio Público de Academias...\n");

  const migrations = [
    "0033_add_public_academy_fields.sql",
    "0034_create_public_academies_view.sql",
    "0035_create_academy_messages.sql",
    "0036_create_academy_geo_groups.sql",
  ];

  let successCount = 0;
  for (const migration of migrations) {
    const success = await applyMigration(migration);
    if (success) successCount++;
  }

  console.log(`\n📊 Resultado: ${successCount}/${migrations.length} migraciones aplicadas`);

  if (successCount === migrations.length) {
    console.log("\n✅ Todas las migraciones se aplicaron correctamente");
  } else {
    console.log("\n⚠️  Algunas migraciones tuvieron errores. Revisa los logs arriba.");
  }

  await pool.end();
}

main().catch((error) => {
  console.error("❌ Error fatal:", error);
  process.exit(1);
});

