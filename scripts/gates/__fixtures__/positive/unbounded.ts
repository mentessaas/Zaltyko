/**
 * POSITIVE FIXTURE — A2/unbounded-reads
 *
 * Each of these patterns should NOT trigger the unbounded-read gate.
 * The fixture is a hand-rolled Drizzle-style AST mimicking the real
 * Zaltyko `db.select().from(T)` shape, but in isolation; we are checking
 * the gate's classification logic, not the live database.
 */
import { and, eq } from "drizzle-orm";

// Hypothetical `db` and `tx` shaped like the real client.
declare const db: any;
declare const tx: any;
declare const athletes: any;

// 1. With .limit(N) — should pass.
export const ok1 = await db
  .select({ id: athletes.id, name: athletes.name })
  .from(athletes)
  .where(eq(athletes.tenantId, "tenant-1"))
  .limit(50);

// 2. With .limit(N) + .offset(M) — should pass.
export const ok2 = await db
  .select({ id: athletes.id })
  .from(athletes)
  .limit(100)
  .offset(200);

// 3. tx.select — should pass when limited.
export const ok3 = await tx
  .select({ id: athletes.id })
  .from(athletes)
  .where(eq(athletes.tenantId, "tenant-1"))
  .limit(25);

// 4. Escape hatch — `unbounded-read-ok` annotation is honoured.
// unbounded-read-ok: seed sweep exports full table for archival
export const ok4 = await db
  .select()
  .from(athletes);

// 5. findMany with explicit `limit:` key — should pass.
declare const acme: { id: string };
declare const dbq: { query: { athletes: { findMany: (opts: any) => Promise<any[]> } } };
export const ok5 = await dbq.query.athletes.findMany({
  where: (a: any, { eq }: any) => eq(a.academyId, acme.id),
  limit: 50,
});

// 6. findMany with explicit `limit:` key (shorthand) — should pass.
export const ok6 = await dbq.query.athletes.findMany({ limit: 10 });

// 7. findMany with `cursor:` key — should pass.
export const ok7 = await dbq.query.athletes.findMany({
  cursor: "abc",
});

export const _noop = { ok1, ok2, ok3, ok4, ok5, ok6, ok7 };
