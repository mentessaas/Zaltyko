import { getSupabaseAdminClient } from "./admin";
import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface SetupVerification {
  storage: {
    bucketExists: boolean;
    policiesCount: number;
  };
  realtime: {
    enabled: boolean;
    tableName: string | null;
    tableNames: string[];
    missingTables: string[];
  };
  rls: {
    notificationsPolicies: number;
    emailLogsPolicies: number;
    scholarshipsPolicies: number;
    discountsPolicies: number;
  };
}

export const REQUIRED_REALTIME_TABLES = [
  "notifications",
  "profiles",
  "subscriptions",
  "academies",
  "classes",
  "billing_invoices",
  "contact_messages",
  "athletes",
  "coaches",
  "groups",
  "group_athletes",
  "class_sessions",
  "class_coach_assignments",
  "athlete_assessments",
  "audit_logs",
] as const;

/**
 * Verifica que Supabase esté configurado correctamente
 */
export async function verifySupabaseSetup(): Promise<SetupVerification> {
  const supabase = getSupabaseAdminClient();
  const results: SetupVerification = {
    storage: {
      bucketExists: false,
      policiesCount: 0,
    },
    realtime: {
      enabled: false,
      tableName: null,
      tableNames: [],
      missingTables: [...REQUIRED_REALTIME_TABLES],
    },
    rls: {
      notificationsPolicies: 0,
      emailLogsPolicies: 0,
      scholarshipsPolicies: 0,
      discountsPolicies: 0,
    },
  };

  let pool: Pool | null = null;

  try {
    // Verificar Storage
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (!bucketsError && buckets) {
      results.storage.bucketExists = buckets.some((b) => b.id === "uploads");
    }

    // Crear pool temporal para consultas SQL
    try {
      const connectionString = getDatabaseUrl();
      pool = new Pool({ connectionString, max: 1 });

      // Verificar políticas de Storage
      const storagePoliciesResult = await pool.query(
        "SELECT COUNT(*)::int as count FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'"
      );
      results.storage.policiesCount = Number(storagePoliciesResult.rows[0]?.count || 0);

      // Verificar Realtime
      const realtimeResult = await pool.query<{ tablename: string }>(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public'"
      );
      const tableNames = realtimeResult.rows.map((row) => row.tablename);
      results.realtime.tableNames = tableNames;
      results.realtime.missingTables = REQUIRED_REALTIME_TABLES.filter(
        (tableName) => !tableNames.includes(tableName)
      );
      results.realtime.enabled = results.realtime.missingTables.length === 0;
      results.realtime.tableName = tableNames.includes("notifications") ? "notifications" : null;

      // Verificar políticas RLS
      const notificationsResult = await pool.query(
        "SELECT COUNT(*)::int as count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications'"
      );
      results.rls.notificationsPolicies = Number(notificationsResult.rows[0]?.count || 0);

      const emailLogsResult = await pool.query(
        "SELECT COUNT(*)::int as count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'email_logs'"
      );
      results.rls.emailLogsPolicies = Number(emailLogsResult.rows[0]?.count || 0);

      const scholarshipsResult = await pool.query(
        "SELECT COUNT(*)::int as count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scholarships'"
      );
      results.rls.scholarshipsPolicies = Number(scholarshipsResult.rows[0]?.count || 0);

      const discountsResult = await pool.query(
        "SELECT COUNT(*)::int as count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discounts'"
      );
      results.rls.discountsPolicies = Number(discountsResult.rows[0]?.count || 0);
    } catch (error) {
      logger.error("Error executing verification queries:", error);
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  } catch (error) {
    logger.error("Error verifying Supabase setup:", error);
    if (pool) {
      await pool.end();
    }
  }

  return results;
}
