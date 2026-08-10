#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

/**
 * Prepara una cuenta E2E de family/parent dentro de una academia aislada, con
 * un athlete asociado para que `resolveFamilyPaymentAccess` autorice el
 * SetupIntent y el cobro off-session. Cierra el prerequisite que
 * `tests/e2e-zaltyko-stripe-connect-flow.spec.ts` declara como "futuro":
 *
 *   > scripts/prepare-e2e-family-auth.ts (futuro) para crear el usuario parent
 *   > con un `family` storage state.
 *
 * Variables de entorno:
 *   - E2E_ALLOW_PROVISIONING=true   obligatoria (safety belt, mismo patrón que
 *                                    prepare-e2e-auth.ts).
 *   - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL
 *   - E2E_ACADEMY_ID                academia AISLADA (no operativa).
 *   - E2E_FAMILY_EMAIL              email del parent (default: e2e-family@zaltyko.test).
 *   - E2E_FAMILY_PASSWORD           password (default: fallback E2E_AUTH_PASSWORD).
 *   - E2E_ATHLETE_NAME              nombre del athlete a crear (default: "E2E Athlete").
 *   - E2E_ATHLETE_LEVEL             nivel (default: "beginner").
 *
 * Idempotente: si el usuario/athlete/guardian ya existen, los reutiliza.
 *
 * Uso:
 *   E2E_ALLOW_PROVISIONING=true \
 *   E2E_ACADEMY_ID=<uuid> \
 *   pnpm tsx scripts/prepare-e2e-family-auth.ts
 *
 * Después, corre `pnpm test:e2e:auth --project=chromium` con
 * E2E_FAMILY_EMAIL/E2E_FAMILY_PASSWORD/E2E_FAMILY_STORAGE_STATE en el env para
 * generar `.auth/family.json`.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const academyId = process.env.E2E_ACADEMY_ID;
const familyEmail = process.env.E2E_FAMILY_EMAIL ?? "e2e-family@zaltyko.test";
const familyPassword = process.env.E2E_FAMILY_PASSWORD ?? process.env.E2E_AUTH_PASSWORD;
const athleteName = process.env.E2E_ATHLETE_NAME ?? "E2E Athlete";
const athleteLevel = process.env.E2E_ATHLETE_LEVEL ?? "beginner";
const caCertPath = process.env.NODE_EXTRA_CA_CERTS;
const ca =
  caCertPath && existsSync(resolve(caCertPath))
    ? readFileSync(resolve(caCertPath), "utf8")
    : undefined;

type SupabaseAdminClient = ReturnType<typeof createClient<any, "public", any>>;

function maskEmail(value: string) {
  if (!value.includes("@")) return "missing";
  const [local, domain] = value.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

async function findAuthUserByEmail(supabase: SupabaseAdminClient, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  return null;
}

async function ensureFamilyAuthUser(supabase: SupabaseAdminClient) {
  if (!familyEmail || !familyPassword) {
    throw new Error("Missing E2E_FAMILY_EMAIL or E2E_FAMILY_PASSWORD");
  }
  const existing = await findAuthUserByEmail(supabase, familyEmail);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: familyPassword,
      email_confirm: true,
      ban_duration: "none",
    });
    if (error) throw error;
    if (!data.user.email) throw new Error("Created family user has no email");
    console.log(`auth family: updated ${maskEmail(data.user.email)}`);
    return data.user;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: familyEmail,
    password: familyPassword,
    email_confirm: true,
    user_metadata: { name: "E2E Family" },
    app_metadata: { source: "zaltyko-e2e", e2eRole: "parent" },
  });
  if (error) throw error;
  if (!data.user.email) throw new Error("Created family user has no email");
  console.log(`auth family: created ${maskEmail(data.user.email)}`);
  return data.user;
}

async function ensureFamilyProfile(pool: Pool, userId: string, tenantId: string) {
  // Rol "parent" — `resolveFamilyPaymentAccess` exige que el profile sea parent,
  // no owner/coach/athlete. Ver src/lib/family/scope-service.ts.
  const profileResult = await pool.query<{ id: string }>(
    `
      insert into profiles (user_id, tenant_id, name, role, active_academy_id, can_login, is_suspended)
      values ($1::uuid, $2::uuid, 'E2E Family', 'parent'::profile_role, $3::uuid, true, false)
      on conflict (user_id) do update set
        tenant_id = excluded.tenant_id,
        name = coalesce(profiles.name, excluded.name),
        role = excluded.role,
        active_academy_id = excluded.active_academy_id,
        can_login = true,
        is_suspended = false
      returning id
    `,
    [userId, tenantId, academyId]
  );
  const profileId = profileResult.rows[0]?.id;
  if (!profileId) throw new Error("Failed to upsert family profile");
  console.log(`profile family: ready (${profileId})`);
  return profileId;
}

async function ensureAthlete(pool: Pool, tenantId: string) {
  // Athletes NO tiene columna email. Determinamos idempotencia por nombre +
  // academia. El nombre se deriva del env para no chocar con academias que
  // tengan otro `E2E Athlete` huérfano.
  const deterministicName = `${athleteName} (${familyEmail.split("@")[0]})`;
  const existing = await pool.query<{ id: string }>(
    `
      select id from athletes
      where academy_id = $1::uuid and name = $2
      limit 1
    `,
    [academyId, deterministicName]
  );
  if (existing.rows[0]?.id) {
    console.log(`athlete: reusing ${existing.rows[0].id}`);
    return existing.rows[0].id;
  }
  const inserted = await pool.query<{ id: string }>(
    `
      insert into athletes (tenant_id, academy_id, name, level, status)
      values ($1::uuid, $2::uuid, $3, $4, 'active')
      returning id
    `,
    [tenantId, academyId, deterministicName, athleteLevel]
  );
  const athleteId = inserted.rows[0]?.id;
  if (!athleteId) throw new Error("Failed to create E2E athlete");
  console.log(`athlete: created ${athleteId}`);
  return athleteId;
}

async function ensureGuardianLink(pool: Pool, profileId: string, athleteId: string, tenantId: string) {
  // Crea el guardian y lo vincula al athlete. `getFamilyChildrenForUser` lee
  // desde guardians/guardian_athletes (path moderno) y desde family_contacts
  // (legacy); cubrimos ambos para no depender de la migración de academias.
  const guardian = await pool.query<{ id: string }>(
    `
      insert into guardians (tenant_id, profile_id, name, email, relationship, is_primary)
      values ($1::uuid, $2::uuid, 'E2E Family', $3, 'parent', true)
      on conflict (profile_id) do update set
        name = excluded.name,
        email = excluded.email,
        relationship = excluded.relationship,
        is_primary = true
      returning id
    `,
    [tenantId, profileId, familyEmail]
  );
  const guardianId = guardian.rows[0]?.id;
  if (!guardianId) throw new Error("Failed to upsert guardian");

  await pool.query(
    `
      insert into guardian_athletes (tenant_id, guardian_id, athlete_id, relationship, is_primary)
      values ($1::uuid, $2::uuid, $3::uuid, 'parent', true)
      on conflict (tenant_id, guardian_id, athlete_id) do update set is_primary = true
    `,
    [tenantId, guardianId, athleteId]
  );

  // Legacy family_contacts — algunas academias todavía resuelven hijos por aquí.
  // family_contacts NO tiene academy_id; el join se hace por athlete_id.
  await pool.query(
    `
      insert into family_contacts (tenant_id, athlete_id, name, email, relationship, notify_email, notify_sms)
      values ($1::uuid, $2::uuid, 'E2E Family', $3, 'parent', true, false)
      on conflict do nothing
    `,
    [tenantId, athleteId, familyEmail]
  );

  console.log(`guardian: linked guardian=${guardianId} athlete=${athleteId}`);
}

async function main() {
  if (process.env.E2E_ALLOW_PROVISIONING !== "true") {
    throw new Error(
      "Refusing to provision E2E family users. Set E2E_ALLOW_PROVISIONING=true only for an approved isolated test academy."
    );
  }
  if (!supabaseUrl || !serviceKey || !databaseUrl || !academyId) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, or E2E_ACADEMY_ID"
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const dbUrl = databaseUrl.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    ssl: ca ? { ca, rejectUnauthorized: true } : false,
  });

  try {
    const academyResult = await pool.query<{ tenant_id: string }>(
      "select tenant_id from academies where id = $1::uuid limit 1",
      [academyId]
    );
    const tenantId = academyResult.rows[0]?.tenant_id;
    if (!tenantId) throw new Error(`E2E academy not found: ${academyId}`);

    const user = await ensureFamilyAuthUser(supabase);
    const profileId = await ensureFamilyProfile(pool, user.id, tenantId);
    const athleteId = await ensureAthlete(pool, tenantId);
    await ensureGuardianLink(pool, profileId, athleteId, tenantId);

    console.log("\nE2E family ready. Next steps:");
    console.log("  1. Run `pnpm test:e2e:auth --project=chromium` with");
    console.log("     E2E_FAMILY_EMAIL, E2E_FAMILY_PASSWORD and");
    console.log("     E2E_FAMILY_STORAGE_STATE=.auth/family.json set.");
    console.log("  2. Run `pnpm playwright test tests/e2e-zaltyko-stripe-connect-flow.spec.ts`");
    console.log("     with E2E_STRIPE_CONNECT_FLOW=1 and a Stripe test sandbox.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`E2E family preparation failed: ${error.message}`);
  process.exit(1);
});