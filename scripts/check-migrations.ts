import "dotenv/config";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";

async function checkMigrations() {
  const dbUrl = getDatabaseUrl();
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log("🔍 Verificando estado de las migraciones...\n");

    // Verificar tablas
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('billing_items', 'charges', 'event_logs')
      ORDER BY table_name;
    `);

    console.log("📊 Tablas encontradas:");
    const existingTables = tablesResult.rows.map((r) => r.table_name);
    const requiredTables = ["billing_items", "charges", "event_logs"];
    
    requiredTables.forEach((table) => {
      const exists = existingTables.includes(table);
      console.log(`  ${exists ? "✅" : "❌"} ${table}`);
    });

    // Verificar enums
    const enumsResult = await pool.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typname IN ('billing_item_periodicity', 'charge_status', 'payment_method')
      ORDER BY typname;
    `);

    console.log("\n📋 Enums encontrados:");
    const existingEnums = enumsResult.rows.map((r) => r.typname);
    const requiredEnums = ["billing_item_periodicity", "charge_status", "payment_method"];
    
    requiredEnums.forEach((enumName) => {
      const exists = existingEnums.includes(enumName);
      console.log(`  ${exists ? "✅" : "❌"} ${enumName}`);
    });

    // Verificar columnas en groups
    const groupsColumnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'groups' 
      AND column_name IN ('monthly_fee_cents', 'billing_item_id')
      ORDER BY column_name;
    `);

    console.log("\n🏷️  Columnas en tabla 'groups':");
    const existingGroupsColumns = groupsColumnsResult.rows.map((r) => r.column_name);
    const requiredGroupsColumns = ["monthly_fee_cents", "billing_item_id"];
    
    requiredGroupsColumns.forEach((col) => {
      const exists = existingGroupsColumns.includes(col);
      console.log(`  ${exists ? "✅" : "❌"} ${col}`);
    });

    // Verificar columnas en group_athletes
    const groupAthletesColumnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'group_athletes' 
      AND column_name = 'custom_fee_cents';
    `);

    console.log("\n👥 Columnas en tabla 'group_athletes':");
    const hasCustomFee = groupAthletesColumnsResult.rows.length > 0;
    console.log(`  ${hasCustomFee ? "✅" : "❌"} custom_fee_cents`);

    // Resumen
    console.log("\n" + "=".repeat(50));
    const allTablesExist = requiredTables.every((t) => existingTables.includes(t));
    const allEnumsExist = requiredEnums.every((e) => existingEnums.includes(e));
    const allGroupsColumnsExist = requiredGroupsColumns.every((c) => existingGroupsColumns.includes(c));
    const allComplete = allTablesExist && allEnumsExist && allGroupsColumnsExist && hasCustomFee;

    if (allComplete) {
      console.log("✅ TODAS LAS MIGRACIONES ESTÁN APLICADAS");
    } else {
      console.log("⚠️  FALTAN MIGRACIONES POR APLICAR");
      console.log("\nEjecuta: drizzle/apply_all_migrations.sql");
    }
    console.log("=".repeat(50));
  } catch (error) {
    console.error("❌ Error al verificar migraciones:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkMigrations();

