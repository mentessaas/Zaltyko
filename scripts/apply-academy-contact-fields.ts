import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";

async function applyAcademyContactFields() {
  const dbUrl = getDatabaseUrl();
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log("📖 Leyendo migración 0037...");
    const sqlFile = join(process.cwd(), "drizzle", "0037_add_academy_contact_fields.sql");
    const sql = readFileSync(sqlFile, "utf-8");

    console.log("🔧 Aplicando campos de contacto a la tabla academies...");
    await pool.query(sql);

    console.log("✅ Migración aplicada exitosamente!");
    console.log("\n📝 Campos agregados:");
    console.log("   - website");
    console.log("   - contact_email");
    console.log("   - contact_phone");
    console.log("   - address");
    console.log("   - social_instagram");
    console.log("   - social_facebook");
    console.log("   - social_twitter");
    console.log("   - social_youtube");
  } catch (error: any) {
    console.error("❌ Error al aplicar migración:", error.message);
    if (error.code === "42701") {
      console.log("ℹ️  Algunos campos ya existen, continuando...");
    } else {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

applyAcademyContactFields();

