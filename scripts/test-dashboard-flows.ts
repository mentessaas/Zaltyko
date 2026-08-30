/**
 * Test Dashboard Flows for each user role
 *
 * CONFIGURATION: Set the following environment variables before running:
 *   - NEXT_PUBLIC_SUPABASE_URL (required)
 *   - SUPABASE_ANON_KEY (required)
 *   - SUPABASE_SERVICE_ROLE_KEY (required)
 *
 * Security: This script does NOT contain any credentials in source. All
 * sensitive values must be provided via environment. See .env.example.
 *
 * @deprecated Use scripts/prepare-e2e-auth.ts instead. Kept for reference only.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    "Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. " +
    "Copy .env.example to .env.local and fill in the values from your Supabase dashboard."
  );
}

const TEST_USERS = [
  { email: "test-superadmin@zaltyko.demo", password: "Test123!@#", role: "super_admin" },
];

// @deprecated Script truncado y sin uso: la referencia vigente es
// scripts/prepare-e2e-auth.ts. No ejecutar; las credenciales de prueba
// deben provisionarse vía el flujo E2E aprobado.
void TEST_USERS;
