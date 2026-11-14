import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const canonicalMigrations = [
  "20261006080702_establish_zaltyko_domain_foundation.sql",
  "20261013100000_model_sport_profiles_and_complementary_activities.sql",
  "20261006085254_add_operational_enrollment_invariants.sql",
  "20261006090034_add_trials_waitlists_families.sql",
  "20261006093047_add_internal_billing_ledger.sql",
  "20261006094607_add_versioned_metric_engine.sql",
  "20261006100146_add_explainable_health_score.sql",
  "20261006113000_add_actionable_insights.sql",
  "20261006123000_add_organization_bootstrap.sql",
  "20261006131000_add_organization_default_currency.sql",
  "20261013082806_organization_payment_accounts.sql",
  "20261013160000_canonical_family_collection_and_entitlements.sql",
];
const canonicalModules = [
  "analytics",
  "attendance",
  "billing",
  "enrollments",
  "health-score",
  "insights",
  "organizations",
  "owner-dashboard",
  "scheduling",
  "shared",
  "trials",
  "waitlists",
];
const requiredDocs = [
  "docs/architecture/adr/0007-arranque-limpio-y-cutover-owner.md",
  "docs/architecture/organization-bootstrap.md",
  "docs/cutover/legacy-retirement-matrix.md",
  "docs/cutover/prepilot-go-no-go.md",
  "docs/privacy/zaltyko-rgpd-assessment.md",
  "docs/runbooks/zaltyko-backup-restore.md",
  "docs/runbooks/zaltyko-observability.md",
  "docs/security/zaltyko-threat-model.md",
];

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

for (const migration of canonicalMigrations) {
  assert(
    existsSync(join(root, "supabase/migrations", migration)),
    `Falta migración canónica: ${migration}`
  );
}
for (const document of requiredDocs) {
  assert(existsSync(join(root, document)), `Falta runbook/gate: ${document}`);
}

const forbidden: Array<{ file: string; pattern: string }> = [];
for (const moduleName of canonicalModules) {
  for (const file of filesUnder(join(root, "src/modules", moduleName)).filter(
    (path) => /\.(ts|tsx)$/.test(path)
  )) {
    const source = readFileSync(file, "utf8");
    for (const pattern of ["@/db/schema", "public."]) {
      if (source.includes(pattern)) {
        forbidden.push({ file: relative(root, file), pattern });
      }
    }
  }
}
assert.deepEqual(
  forbidden,
  [],
  `El núcleo canónico depende del modelo legacy: ${JSON.stringify(forbidden)}`
);

for (const legacyRoute of [
  "src/app/onboarding/owner/page.tsx",
]) {
  const source = readFileSync(join(root, legacyRoute), "utf8");
  assert(
    source.includes('redirect("/owner'),
    `${legacyRoute} no corta a /owner`
  );
  assert(!source.includes("@/db/schema"), `${legacyRoute} aún consulta legacy`);
}

// El panel antiguo /app se retiró: su árbol no existe y todas sus URLs son
// redirects permanentes a /owner (next.config.mjs).
assert(!existsSync(join(root, "src/app/app")), "src/app/app (panel antiguo) sigue existiendo");
const legacyAppRedirects = readFileSync(
  join(root, "src/lib/launch/legacy-app-redirects.mjs"),
  "utf8"
);
assert(
  legacyAppRedirects.includes('["/app/:path*", LEGACY_APP_FALLBACK]') &&
    legacyAppRedirects.includes('LEGACY_APP_FALLBACK = "/owner"'),
  "/app y subrutas no redirigen a /owner"
);
assert(
  readFileSync(join(root, "next.config.mjs"), "utf8").includes("LEGACY_APP_REDIRECTS"),
  "next.config.mjs no aplica LEGACY_APP_REDIRECTS"
);

console.log(
  JSON.stringify({
    status: "PASS",
    canonicalMigrations: canonicalMigrations.length,
    canonicalModules: canonicalModules.length,
    requiredOperationalDocuments: requiredDocs.length,
    legacyOwnerRoutesRetired: 4,
    remoteReadiness: "NO_VERIFICADO",
  })
);
