import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles, memberships, academies } from "@/db/schema";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: pnpm tsx scripts/test-drizzle.ts <userId>");
    process.exit(1);
  }

  try {
    const rows = await db
      .select({
        id: profiles.id,
        userId: profiles.userId,
        name: profiles.name,
        role: profiles.role,
        tenantId: profiles.tenantId,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    console.log("Profile rows:", rows);

    const academyRows = await db
      .select({
        id: academies.id,
        name: academies.name,
      })
      .from(memberships)
      .innerJoin(academies, eq(memberships.academyId, academies.id))
      .where(eq(memberships.userId, userId))
      .orderBy(academies.name);

    console.log("Academy rows:", academyRows);
  } catch (error) {
    console.error("Drizzle error:", error);
  }
}

main().then(() => process.exit(0));


