/* eslint-disable no-console */
import "dotenv/config";

import { syncStripePlans } from "@/lib/stripe/sync-plans";

async function main() {
  const result = await syncStripePlans();

  console.log("✓ Stripe plans sincronizados");
  console.log("Planes actualizados:", result.updatedPlanCodes.join(", ") || "Ninguno");
  console.log("Planes archivados:", result.archivedPlanCodes.join(", ") || "Ninguno");

  if (result.missingStripePrices.length > 0) {
    console.warn("⚠️ Precios sin metadata plan_code:", result.missingStripePrices.join(", "));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error al sincronizar planes con Stripe");
    console.error(error);
    process.exit(1);
  });


