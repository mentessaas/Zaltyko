/**
 * NEGATIVE FIXTURE — A2/unbounded-reads
 *
 * Each of these patterns SHOULD trigger the unbounded-read gate.
 * The fixture file is loaded only when the gate is run with
 * `--root scripts/gates/__fixtures__/negative`; running it against the
 * production source tree would naturally trigger many of these.
 */
import { eq } from "drizzle-orm";

declare const db: any;
declare const tx: any;
declare const athletes: any;

// 1. No limit, no escape hatch — should trigger.
export const bad1 = await db
  .select({ id: athletes.id, name: athletes.name })
  .from(athletes)
  .where(eq(athletes.tenantId, "tenant-1"));

// 2. tx.select without limit — should trigger.
export const bad2 = await tx
  .select()
  .from(athletes)
  .where(eq(athletes.tenantId, "tenant-1"));

// 3. findMany without limit/cursor/offset — should trigger.
declare const dbq: { query: { athletes: { findMany: (opts?: any) => Promise<any[]> } } };
export const bad3 = await dbq.query.athletes.findMany();

// 4. findMany with `limit: undefined` — should still trigger (uninitialised).
export const bad4 = await dbq.query.athletes.findMany({ limit: undefined });

// 5. Inner join that *still* has no limit — should trigger.
declare const guardians: any;
export const bad5 = await db
  .select({ id: athletes.id })
  .from(athletes)
  .leftJoin(guardians, eq(guardians.athleteId, athletes.id));

export const _noop = { bad1, bad2, bad3, bad4, bad5 };
