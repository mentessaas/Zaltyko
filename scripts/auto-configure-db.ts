#!/usr/bin/env tsx
/**
 * Script para configurar automáticamente la conexión usando MCP de Supabase.
 *
 * SECURITY: Credentials must be provided via environment variables. Never
 * hardcode keys in source.
 *
 * Required env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_ANON_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY (admin-only)
 */
import { writeFileSync } from "fs";
import { resolve } from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error(
    "Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY. " +
    "Copy .env.example to .env.local and fill in the values from your Supabase dashboard."
  );
}

console.log("Configurando conexión automática...\n");
