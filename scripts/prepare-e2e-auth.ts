#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

type E2ERole = "owner" | "coach" | "super_admin";

interface RoleConfig {
  label: string;
  email: string | undefined;
  password: string | undefined;
  profileRole: E2ERole;
  membershipRole?: "owner" | "coach";
  defaultName: string;
}

type SupabaseAdminClient = ReturnType<typeof createClient<any, "public", any>>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const academyId = process.env.E2E_ACADEMY_ID;
const fallbackPassword = process.env.E2E_AUTH_PASSWORD;
const caCertPath = process.env.NODE_EXTRA_CA_CERTS;
const ca =
  caCertPath && existsSync(resolve(caCertPath))
    ? readFileSync(resolve(caCertPath), "utf8")
    : undefined;

const roles: RoleConfig[] = [
  {
    label: "owner",
    email: process.env.E2E_AUTH_EMAIL,
    password: process.env.E2E_AUTH_PASSWORD,
    profileRole: "owner",
    membershipRole: "owner",
    defaultName: "E2E Owner",
  },
  {
    label: "coach",
    email: process.env.E2E_COACH_EMAIL ?? "e2e-coach@zaltyko.test",
    password: process.env.E2E_COACH_PASSWORD ?? fallbackPassword,
    profileRole: "coach",
    membershipRole: "coach",
    defaultName: "E2E Coach",
  },
  {
    label: "super-admin",
    email: process.env.E2E_SUPER_ADMIN_EMAIL ?? "e2e-super-admin@zaltyko.test",
    password: process.env.E2E_SUPER_ADMIN_PASSWORD ?? fallbackPassword,
    profileRole: "super_admin",
    defaultName: "E2E Super Admin",
  },
];

function maskEmail(value: string | undefined) {
  if (!value || !value.includes("@")) return "missing";
  const [local, domain] = value.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

async function findAuthUserByEmail(
  supabase: SupabaseAdminClient,
  email: string
) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );
    if (found) return found;
    if (data.users.length < 100) return null;
  }

  return null;
}

async function ensureAuthUser(supabase: SupabaseAdminClient, role: RoleConfig) {
  if (!role.email || !role.password) {
    throw new Error(`Missing email/password for ${role.label}`);
  }

  const existing = await findAuthUserByEmail(supabase, role.email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(
      existing.id,
      {
        password: role.password,
        email_confirm: true,
        ban_duration: "none",
      }
    );
    if (error) throw error;
    console.log(`auth ${role.label}: updated ${maskEmail(data.user.email)}`);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: role.email,
    password: role.password,
    email_confirm: true,
    user_metadata: { name: role.defaultName },
    app_metadata: { source: "zaltyko-e2e", e2eRole: role.profileRole },
  });
  if (error) throw error;
  console.log(`auth ${role.label}: created ${maskEmail(data.user.email)}`);
  return data.user;
}

async function ensureProfileAndMembership(
  pool: Pool,
  role: RoleConfig,
  userId: string,
  tenantId: string
) {
  const profileResult = await pool.query<{ id: string }>(
    `
      insert into profiles (user_id, tenant_id, name, role, active_academy_id, can_login, is_suspended)
      values ($1::uuid, $2::uuid, $3, $4::profile_role, $5::uuid, true, false)
      on conflict (user_id) do update set
        tenant_id = excluded.tenant_id,
        name = coalesce(profiles.name, excluded.name),
        role = excluded.role,
        active_academy_id = excluded.active_academy_id,
        can_login = true,
        is_suspended = false
      returning id
    `,
    [userId, tenantId, role.defaultName, role.profileRole, academyId]
  );
  const profileId = profileResult.rows[0]?.id;
  if (!profileId) throw new Error(`Failed to upsert profile for ${role.label}`);

  if (role.membershipRole) {
    await pool.query(
      `
        insert into memberships (user_id, academy_id, role)
        values ($1::uuid, $2::uuid, $3::membership_role)
        on conflict (user_id, academy_id) do update set role = excluded.role
      `,
      [userId, academyId, role.membershipRole]
    );
  }

  if (role.profileRole === "owner") {
    await pool.query(
      "update academies set owner_id = $1::uuid where id = $2::uuid",
      [profileId, academyId]
    );
  }

  if (role.profileRole === "coach") {
    const coachColumnsResult = await pool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'coaches'
      `
    );
    const coachColumns = new Set(
      coachColumnsResult.rows.map((row) => row.column_name)
    );
    const hasProfileLink = coachColumns.has("profile_id");
    const hasUserLink = coachColumns.has("user_id");

    const coachResult = hasUserLink
      ? await pool.query<{ id: string }>(
          "select id from coaches where academy_id = $1::uuid and user_id = $2::uuid limit 1",
          [academyId, userId]
        )
      : await pool.query<{ id: string }>(
          "select id from coaches where academy_id = $1::uuid and lower(email) = lower($2) limit 1",
          [academyId, role.email]
        );

    if (coachResult.rows[0]?.id) {
      if (hasProfileLink && hasUserLink) {
        await pool.query(
          `
            update coaches
            set tenant_id = $1::uuid, profile_id = $2::uuid, user_id = $3::uuid, name = $4, email = $5
            where id = $6::uuid
          `,
          [
            tenantId,
            profileId,
            userId,
            role.defaultName,
            role.email,
            coachResult.rows[0].id,
          ]
        );
      } else {
        await pool.query(
          `
            update coaches
            set tenant_id = $1::uuid, name = $2, email = $3
            where id = $4::uuid
          `,
          [tenantId, role.defaultName, role.email, coachResult.rows[0].id]
        );
      }
    } else {
      if (hasProfileLink && hasUserLink) {
        await pool.query(
          `
            insert into coaches (tenant_id, academy_id, name, email, profile_id, user_id, is_public)
            values ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, false)
          `,
          [tenantId, academyId, role.defaultName, role.email, profileId, userId]
        );
      } else {
        await pool.query(
          `
            insert into coaches (tenant_id, academy_id, name, email, is_public)
            values ($1::uuid, $2::uuid, $3, $4, false)
          `,
          [tenantId, academyId, role.defaultName, role.email]
        );
      }
    }
  }

  console.log(`profile ${role.label}: ready`);
}

async function main() {
  if (process.env.E2E_ALLOW_PROVISIONING !== "true") {
    throw new Error(
      "Refusing to provision E2E users. Set E2E_ALLOW_PROVISIONING=true only for an approved isolated test academy."
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

    for (const role of roles) {
      const user = await ensureAuthUser(supabase, role);
      await ensureProfileAndMembership(pool, role, user.id, tenantId);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`E2E auth preparation failed: ${error.message}`);
  process.exit(1);
});
