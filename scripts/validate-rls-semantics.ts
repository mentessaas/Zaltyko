#!/usr/bin/env tsx
/* eslint-disable no-console */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = resolve(
  process.cwd(),
  "supabase/migrations/20260716181006_day2_rls_semantic_hardening.sql"
);
const fixture = resolve(process.cwd(), "supabase/tests/rls_semantics.sql");
const migrationSql = readFileSync(migration, "utf8");
const communicationMigrationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260716214500_day3_communication_academy_scope.sql"
  ),
  "utf8"
);
const fixtureSql = readFileSync(fixture, "utf8");

const requiredPrivateHelpers = [
  "current_profile_id",
  "current_tenant_id",
  "is_super_admin",
  "is_academy_manager",
  "row_in_current_tenant",
  "is_academy_member",
  "is_assigned_coach",
  "can_access_athlete",
  "can_access_guardian",
  "can_access_class",
];

const requiredPolicyTables = [
  "academies",
  "profiles",
  "memberships",
  "athletes",
  "guardians",
  "guardian_athletes",
  "classes",
  "class_sessions",
  "class_coach_assignments",
  "class_enrollments",
  "attendance_records",
  "athlete_assessments",
  "assessment_scores",
  "charges",
  "billing_items",
  "billing_invoices",
  "countries",
  "sport_disciplines",
  "sport_branches",
  "sport_locale_configs",
  "terminology_dictionary",
  "apparatus",
  "programs",
  "levels",
  "categories",
  "competition_types",
];

const requiredCases = [
  "Owner A",
  "Coach:",
  "Parent:",
  "Athlete:",
  "Viewer:",
  "tenant_id enviado por cliente",
  "Super admin",
  "Anónimo:",
  "Catálogos globales:",
];

const failures: string[] = [];

for (const helper of requiredPrivateHelpers) {
  if (!migrationSql.includes(`FUNCTION zaltyko_private.${helper}(`)) {
    failures.push(`missing private helper ${helper}`);
  }
}

for (const table of requiredPolicyTables) {
  if (!migrationSql.match(new RegExp(`ON public\\.${table}\\b`, "i"))) {
    failures.push(`missing semantic policy for ${table}`);
  }
}

for (const testCase of requiredCases) {
  if (!fixtureSql.includes(testCase)) failures.push(`missing fixture case ${testCase}`);
}

for (const assertion of [
  "authenticated catalog read failed",
  "anon read authenticated catalog",
  "owner A message group scope failed",
  "coach wrote communication through Data API",
  "anon saw global system template",
]) {
  if (!fixtureSql.includes(assertion)) failures.push(`missing fixture assertion ${assertion}`);
}

if (/auth\.role\s*\(/i.test(migrationSql)) {
  failures.push("new migration uses deprecated auth.role()");
}
if (!migrationSql.includes("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zaltyko_private FROM PUBLIC")) {
  failures.push("private helper EXECUTE is not revoked from PUBLIC");
}
if (!migrationSql.includes("SET search_path = pg_catalog")) {
  failures.push("helpers do not pin search_path");
}
if (!fixtureSql.includes("ROLLBACK;")) {
  failures.push("semantic fixture does not roll back");
}
for (const table of [
  "message_templates",
  "message_groups",
  "scheduled_notifications",
]) {
  if (!communicationMigrationSql.includes(`ON public.${table}`)) {
    failures.push(`missing academy-scoped communication policy for ${table}`);
  }
}
if (!communicationMigrationSql.includes("CASE WHEN auth.uid() IS NULL THEN false")) {
  failures.push("communication reads do not short-circuit anonymous identities");
}
if ((communicationMigrationSql.match(/FOR SELECT TO authenticated USING/g) ?? []).length !== 3) {
  failures.push("communication reads are not restricted to the authenticated database role");
}
if (!communicationMigrationSql.includes("zaltyko_private.is_academy_member(academy_id)")) {
  failures.push("communication reads are not academy-member scoped");
}
if (!communicationMigrationSql.includes("zaltyko_private.is_academy_manager(academy_id)")) {
  failures.push("communication writes are not academy-manager scoped");
}

if (failures.length > 0) {
  console.error("RLS semantic contract: FAIL (static validation only)");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("RLS semantic contract: PASS (static validation only)");
console.log(`Private helpers: ${requiredPrivateHelpers.length}`);
console.log(`Policy tables: ${requiredPolicyTables.length}`);
console.log(`Prepared isolated-DB cases: ${requiredCases.length}`);
console.log("Communication academy scope: 3 tables + authenticated global templates");
console.log("Database execution: not performed by this validator");
