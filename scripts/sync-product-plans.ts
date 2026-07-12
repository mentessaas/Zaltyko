/* eslint-disable no-console */
import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { BILLABLE_PRODUCT_PLANS } from "@/lib/plans/catalog";

config({ path: ".env.local" });
config({ path: ".env" });

const shouldApply = process.argv.includes("--apply");

async function main() {
  const existing = await db.select().from(plans);
  const byCode = new Map(existing.map((plan) => [plan.code, plan]));

  console.log(`Product plan sync (${shouldApply ? "APPLY" : "DRY-RUN"})`);
  console.log("========================================");

  for (const canonical of BILLABLE_PRODUCT_PLANS) {
    const current = byCode.get(canonical.code);
    console.log(
      `${canonical.code}: ${current?.nickname ?? "missing"} -> ${canonical.publicName}; ` +
        `price ${current?.priceEur ?? "-"} -> ${canonical.priceEurCents}; ` +
        `athletes ${current?.athleteLimit ?? "unlimited"} -> ${canonical.athleteLimit ?? "unlimited"}; ` +
        `academies ${current?.academyLimit ?? "unlimited"} -> ${canonical.academyLimit ?? "unlimited"}`
    );

    if (!shouldApply) continue;

    await db
      .insert(plans)
      .values({
        code: canonical.code,
        nickname: canonical.publicName,
        priceEur: canonical.priceEurCents,
        athleteLimit: canonical.athleteLimit,
        academyLimit: canonical.academyLimit,
        currency: "eur",
        billingInterval: canonical.code === "free" ? null : "month",
        isArchived: false,
      })
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          nickname: canonical.publicName,
          priceEur: canonical.priceEurCents,
          athleteLimit: canonical.athleteLimit,
          academyLimit: canonical.academyLimit,
          currency: "eur",
          billingInterval: canonical.code === "free" ? null : "month",
          isArchived: false,
        },
      });
  }

  const unknown = existing.filter(
    (plan) => !BILLABLE_PRODUCT_PLANS.some((canonical) => canonical.code === plan.code)
  );
  if (unknown.length > 0) {
    console.log(`Unknown rows preserved: ${unknown.map((plan) => plan.code).join(", ")}`);
  }

  if (shouldApply) {
    console.log(`Applied ${BILLABLE_PRODUCT_PLANS.length} canonical product plans.`);
  } else {
    console.log("Dry-run complete. Re-run with --apply after reviewing the output.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
