import { readFileSync } from "node:fs";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  const migrationPath = process.argv[2];
  if (!migrationPath) {
    console.error("Uso: pnpm tsx scripts/apply-migration.ts <ruta-al-sql>");
    process.exit(1);
  }
  const content = readFileSync(migrationPath, "utf8");
  console.log(`Aplicando migracion: ${migrationPath}`);
  console.log(`Tamano: ${content.length} bytes`);

  // Enviamos el SQL completo. La conexion via Drizzle/pg acepta multiples sentencias separadas por ;
  // en un mismo query(). Para bloques DO $$ ... $$ el driver los maneja correctamente.
  try {
    await db.execute(sql.raw(content));
    console.log("\nMigracion aplicada correctamente.");
  } catch (e: any) {
    console.error(`\nERROR: ${e.message}`);
    if (e.cause) console.error(`Causa: ${e.cause.message}`);
    throw e;
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});