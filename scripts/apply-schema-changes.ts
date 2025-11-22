import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";

async function applySchemaChanges() {
  const dbUrl = getDatabaseUrl();
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log("📖 Leyendo script SQL...");
    const sqlFile = join(process.cwd(), "drizzle", "0018_apply_all_schema_changes.sql");
    const sql = readFileSync(sqlFile, "utf-8");

    console.log("🔧 Ejecutando cambios en la base de datos...");
    await pool.query(sql);

    console.log("✅ Todos los cambios aplicados exitosamente!");
    console.log("\n📝 Nota: Asegúrate de ejecutar supabase/rls.sql para aplicar las políticas RLS actualizadas.");
  } catch (error) {
    console.error("❌ Error al aplicar cambios:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applySchemaChanges();

