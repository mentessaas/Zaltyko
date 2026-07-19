#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authEmail = process.env.E2E_AUTH_EMAIL;
const authPassword = process.env.E2E_AUTH_PASSWORD;

function mask(value?: string) {
  if (!value) return "missing";
  return `${value.slice(0, 8)}...${value.slice(-6)} (${value.startsWith("sb_") ? "new api key" : "jwt"}, len ${value.length})`;
}

async function verifyKey(label: string, key?: string) {
  if (!supabaseUrl || !key) {
    return { ok: false, message: `${label}: missing URL or key` };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, message: `${label}: ${response.status} ${body.slice(0, 180)}` };
  }

  return { ok: true, message: `${label}: OK` };
}

async function main() {
  console.log("Supabase auth verification");
  console.log("==========================\n");
  console.log(`URL: ${supabaseUrl ?? "missing"}`);
  console.log(`Anon key: ${mask(anonKey)}`);
  console.log(`Service key: ${mask(serviceKey)}\n`);

  const anonResult = await verifyKey("anon key", anonKey);
  const serviceResult = await verifyKey("service key", serviceKey);
  console.log(anonResult.ok ? `✅ ${anonResult.message}` : `❌ ${anonResult.message}`);
  console.log(serviceResult.ok ? `✅ ${serviceResult.message}` : `❌ ${serviceResult.message}`);

  if (!anonResult.ok || !serviceResult.ok) {
    console.log("\nAction required: regenerate the affected key in Supabase Dashboard > Project Settings > API.");
    process.exit(1);
  }

  if (!authEmail || !authPassword) {
    console.log("\nℹ️  E2E_AUTH_EMAIL/E2E_AUTH_PASSWORD not set; skipped user login verification.");
    return;
  }

  const supabase = createClient(supabaseUrl!, anonKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: authPassword,
  });

  if (error) {
    console.log(`\n❌ E2E user login failed: ${error.status ?? "unknown"} ${error.message}`);
    console.log("Action required: verify the test user's password, email confirmation, and Auth user status.");
    process.exit(1);
  }

  console.log(`\n✅ E2E user login OK: ${data.user.email}`);
}

main().catch((error) => {
  console.error(`Unexpected verification error: ${error.message}`);
  process.exit(1);
});
