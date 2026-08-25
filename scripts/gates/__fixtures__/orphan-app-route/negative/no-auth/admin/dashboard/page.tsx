// Negative: this is the actual ZAL-588 leak shape — a server component under
// src/app/app/admin/dashboard that performs anonymous DB queries. No auth
// primitive, no parent layout, no escape hatch. The fixture exists only to
// prove the gate flags it.
import { db } from "@/db";
import { academies } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function OrphanAdminDashboard() {
  const rows = await db.select().from(academies);
  return <pre>{JSON.stringify(rows)}</pre>;
}
