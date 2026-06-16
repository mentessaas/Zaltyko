import "dotenv/config";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";

async function verifyMigrationsStatus() {
  const dbUrl = getDatabaseUrl();
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log("🔍 Verificando estado de todas las migraciones...\n");

    // 1. Verificar tabla event_logs
    console.log("1️⃣ Verificando tabla event_logs...");
    const eventLogsResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'event_logs';
    `);
    const eventLogsExists = eventLogsResult.rows.length > 0;
    console.log(`   ${eventLogsExists ? "✅" : "❌"} Tabla event_logs ${eventLogsExists ? "existe" : "NO existe"}`);

    if (eventLogsExists) {
      // Verificar columnas de event_logs
      const eventLogsColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'event_logs'
        ORDER BY column_name;
      `);
      console.log(`   Columnas: ${eventLogsColumns.rows.map((r) => r.column_name).join(", ")}`);
    }

    // 2. Verificar RLS en las tablas
    console.log("\n2️⃣ Verificando RLS (Row Level Security)...");
    const rlsResult = await pool.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('billing_items', 'charges', 'event_logs')
      ORDER BY tablename;
    `);

    const tablesToCheck = ["billing_items", "charges", "event_logs"];
    tablesToCheck.forEach((table) => {
      const tableInfo = rlsResult.rows.find((r) => r.tablename === table);
      if (tableInfo) {
        const rlsEnabled = tableInfo.rowsecurity === true;
        console.log(`   ${rlsEnabled ? "✅" : "❌"} ${table}: RLS ${rlsEnabled ? "habilitado" : "NO habilitado"}`);
      } else {
        console.log(`   ⚠️  ${table}: Tabla no existe`);
      }
    });

    // 3. Verificar políticas RLS
    console.log("\n3️⃣ Verificando políticas RLS...");
    const policiesResult = await pool.query(`
      SELECT tablename, policyname 
      FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename IN ('billing_items', 'charges', 'event_logs')
      ORDER BY tablename, policyname;
    `);

    const expectedPolicies = {
      billing_items: ["billing_items_select", "billing_items_modify"],
      charges: ["charges_select", "charges_modify"],
      event_logs: ["event_logs_select", "event_logs_modify"],
    };

    Object.entries(expectedPolicies).forEach(([table, policies]) => {
      const tablePolicies = policiesResult.rows.filter((p) => p.tablename === table);
      policies.forEach((policy) => {
        const exists = tablePolicies.some((p) => p.policyname === policy);
        console.log(`   ${exists ? "✅" : "❌"} ${table}.${policy} ${exists ? "existe" : "NO existe"}`);
      });
    });

    // 4. Verificar funciones de triggers (seguridad)
    console.log("\n4️⃣ Verificando seguridad de funciones de triggers...");
    const functionsResult = await pool.query(`
      SELECT 
        proname as function_name,
        prosecdef as is_security_definer,
        proconfig as config
      FROM pg_proc
      WHERE proname IN ('update_billing_items_updated_at', 'update_charges_updated_at');
    `);

    const expectedFunctions = ["update_billing_items_updated_at", "update_charges_updated_at"];
    expectedFunctions.forEach((funcName) => {
      const func = functionsResult.rows.find((f) => f.function_name === funcName);
      if (func) {
        const hasSecurityDefiner = func.is_security_definer === true;
        const hasSearchPath = func.config && func.config.includes("search_path=public");
        console.log(`   ${hasSecurityDefiner && hasSearchPath ? "✅" : "❌"} ${funcName}:`);
        console.log(`      - SECURITY DEFINER: ${hasSecurityDefiner ? "✅" : "❌"}`);
        console.log(`      - SET search_path: ${hasSearchPath ? "✅" : "❌"}`);
      } else {
        console.log(`   ⚠️  ${funcName}: Función no existe`);
      }
    });

    // Resumen final
    console.log("\n" + "=".repeat(60));
    const allChecks = [
      eventLogsExists,
      rlsResult.rows.length === 3 && rlsResult.rows.every((r) => r.rowsecurity === true),
      policiesResult.rows.length >= 6,
      functionsResult.rows.length === 2 &&
        functionsResult.rows.every(
          (f) => f.is_security_definer === true && f.config && f.config.includes("search_path=public")
        ),
    ];

    const allComplete = allChecks.every((check) => check === true);

    if (allComplete) {
      console.log("✅ TODAS LAS MIGRACIONES ESTÁN APLICADAS CORRECTAMENTE");
    } else {
      console.log("⚠️  FALTAN MIGRACIONES POR APLICAR");
      console.log("\nArchivos SQL pendientes:");
      if (!eventLogsExists) {
        console.log("  - drizzle/0024_apply_event_logs_only.sql");
      }
      if (!rlsResult.rows.every((r) => r.rowsecurity === true) || policiesResult.rows.length < 6) {
        console.log("  - drizzle/0025_add_rls_policies.sql");
      }
      if (
        !functionsResult.rows.every(
          (f) => f.is_security_definer === true && f.config && f.config.includes("search_path=public")
        )
      ) {
        console.log("  - drizzle/0026_fix_trigger_functions_security.sql");
      }
    }
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ Error al verificar migraciones:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyMigrationsStatus();

