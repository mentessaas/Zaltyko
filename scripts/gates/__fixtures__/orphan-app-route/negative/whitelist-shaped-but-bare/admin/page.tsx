// Negative: looks like a normal page (no `[academyId]` so it does NOT inherit
// the academy layout) but has no auth and no parent layout. Same pattern as
// the ZAL-588 leak in a different shape.
import { db } from "@/db";
import { plans } from "@/db/schema";

export default async function Page() {
  const rows = await db.select().from(plans);
  return <div>{rows.length} plans</div>;
}
