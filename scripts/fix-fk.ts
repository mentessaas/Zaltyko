import "dotenv/config";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Removing FK constraints...");

  try {
    await db.execute(sql`ALTER TABLE empleo_listings DROP CONSTRAINT IF EXISTS empleo_listings_user_id_profiles_id_fk`);
    console.log("✓ Removed FK from empleo_listings");
  } catch (e) {
    console.log("Error removing FK from empleo_listings:", e);
  }

  try {
    await db.execute(sql`ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_user_id_profiles_id_fk`);
    console.log("✓ Removed FK from marketplace_listings");
  } catch (e) {
    console.log("Error removing FK from marketplace_listings:", e);
  }

  console.log("Done!");
  process.exit(0);
}

main().catch(console.error);
