import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { createDatabasePoolConfig } from "@/db/pool-config";
import type { TransactionClient } from "@/lib/db-transactions";
import { getDatabaseUrl } from "@/lib/env";
import {
  lockOrganizationForSaasMutation,
  resolveEffectiveOrganizationEntitlement,
} from "@/modules/saas-billing/application/entitlement-service";
import {
  getOrganizationUsage,
} from "@/modules/saas-billing/application/organization-usage";
import { assertOrganizationAthleteCapacity } from "@/modules/groups/application/organization-athlete-capacity";

// Remote sandbox only. No domain writes, fixtures, provider calls or clock mocks.
// This proves real lock contention at an ALREADY FULL cap, not a last-slot race.
const sandbox = "aeeootdmuiqkfeernskw";
const qaOrg = "ea613b46-f1e2-44b3-8d2f-1a4b98c9e481";
const paidOrg = "97baa345-b39a-4837-a1dd-38a0b19ce271";
const domainTables = [
  "athletes", "audit_log", "class_template_groups", "class_template_weekdays",
  "class_templates", "enrollments", "group_membership_history", "group_memberships",
  "groups", "outbox_events", "people", "session_staff", "sessions",
] as const;

function target() {
  expect(process.env.VERCEL).toBe("1");
  expect(process.env.VERCEL_ENV).toBe("preview");
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(`https://${sandbox}.supabase.co`);
  // Check presence/identity only; never include a connection URL in an assertion.
  let direct = false;
  let pooler = false;
  try {
    const url = new URL(getDatabaseUrl());
    direct = url.hostname === `db.${sandbox}.supabase.co`;
    pooler = url.hostname.endsWith(".pooler.supabase.com") &&
      decodeURIComponent(url.username).endsWith(`.${sandbox}`);
  } catch {
    throw new Error("Invalid sandbox PostgreSQL connection configuration");
  }
  expect(direct || pooler, "PostgreSQL must belong to the approved sandbox").toBe(true);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>, milliseconds: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function connection(tx: TransactionClient) {
  await tx.execute(sql`set local statement_timeout = '3500'`);
  await tx.execute(sql`set local lock_timeout = '3000'`);
  await tx.execute(sql`set local idle_in_transaction_session_timeout = '12000'`);
  const row = (await tx.execute(sql`
    select pg_backend_pid()::int as pid,
      current_setting('transaction_isolation') as isolation
  `)).rows[0];
  expect(row.isolation).toBe("read committed");
  expect(Number.isSafeInteger(row.pid)).toBe(true);
  return Number(row.pid);
}

async function snapshot(tx: TransactionClient, organizationId: string, commercial = false) {
  const tables: readonly string[] = commercial
    ? [...domainTables, "organization_entitlements", "organization_saas_subscriptions"]
    : domainTables;
  const rows = sql.join(tables.map(table => sql`
    select ${table}::text as table_name, count(*)::int as count,
      md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
    from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r
    where r.organization_id = ${organizationId}::uuid
  `), sql` union all `);
  return (await tx.execute(sql`select * from (${rows}) snapshots order by table_name`)).rows;
}

async function readSnapshot(organizationId: string, commercial = false) {
  return withConnections(1, 6000, async ([database]) => database.transaction(async tx => {
    await tx.execute(sql`set local statement_timeout = '3500'`);
    return snapshot(tx, organizationId, commercial);
  }, { accessMode: "read only", isolationLevel: "read committed" }));
}

async function withConnections<T>(count: 1 | 3, milliseconds: number,
  work: (connections: ReturnType<typeof drizzle>[], signal: AbortSignal) => Promise<T>) {
  const pool = new Pool({
    ...createDatabasePoolConfig({ connectionString: getDatabaseUrl(), production: true }),
    max: count,
    connectionTimeoutMillis: 3000,
    query_timeout: 4000,
  });
  const controller = new AbortController();
  const released = new Set<PoolClient>();
  const clients: PoolClient[] = [];
  let failure: unknown;
  const release = (client: PoolClient) => {
    if (released.has(client)) return;
    released.add(client);
    client.release(true);
  };
  const stop = (error: unknown) => {
    failure ??= error;
    controller.abort();
    // Real socket destruction, not a Promise.race that leaves SQL running.
    for (const client of clients) release(client);
  };
  const onPoolError = (error: Error) => stop(error);
  pool.on("error", onPoolError);
  // Settle every acquisition, including partial failure; never silently skip.
  const leases = await Promise.allSettled(Array.from({ length: count }, async () => {
    const client = await pool.connect();
    client.on("error", stop);
    clients.push(client);
    if (controller.signal.aborted) release(client);
    return client;
  }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (leases.some(lease => lease.status === "rejected") || clients.length !== count) {
      throw new Error("Required sandbox PostgreSQL connections are unavailable");
    }
    if (failure !== undefined) throw failure;
    timer = setTimeout(() => stop(new Error("Sandbox PostgreSQL work deadline exceeded")), milliseconds);
    // Await callback settlement even after deadline/socket destruction.
    const result = await work(clients.map(client => drizzle(client)), controller.signal);
    if (failure !== undefined) throw failure;
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    for (const client of clients) release(client);
    await pool.end();
    for (const client of clients) client.removeListener("error", stop);
    pool.removeListener("error", onPoolError);
  }
}

type Ready = { pid: number } | { error: unknown };
function readyPid(ready: Ready): number {
  if ("error" in ready) throw ready.error;
  return ready.pid;
}

describe("sandbox read-only PostgreSQL boundaries (not HTTP / not last-slot consumption)", () => {
  it("observes two real connections contend for the full QA cap, with a third observer and no domain writes", async () => {
    target();
    const before = await readSnapshot(qaOrg);
    const outcome = await withConnections(3, 12000, async ([aDb, bDb, observerDb], signal) => {
    const aReady = deferred<Ready>();
    const bReady = deferred<Ready>();
    const releaseA = deferred<void>();
    const onAbort = () => releaseA.resolve();
    signal.addEventListener("abort", onAbort, { once: true });
    const rollbackA = new Error("ROLLBACK_LOCK_A");
    const rollbackB = new Error("ROLLBACK_LOCK_B");
    const rollbackObserver = new Error("ROLLBACK_LOCK_OBSERVER");
    let aFinished = false;
    let bFinished = false;
    let releasedA = false;
    let guardError: unknown;
    let failure: unknown;
    let b: Promise<unknown> | undefined;
    let aOutcome: unknown;
    let bOutcome: unknown;

    // Catch immediately: no rejected background promise is ever left unhandled.
    // Drizzle performs ROLLBACK; the outer finally releases the three clients.
    const a = aDb.transaction(async tx => {
      const pid = await connection(tx);
      await lockOrganizationForSaasMutation(tx, qaOrg);
      const usage = await getOrganizationUsage(tx, qaOrg);
      expect(usage.planCode).toBe("free");
      expect(usage.readOnly).toBe(false);
      expect(usage.resources.map(item => item.current)).toEqual([30, 3, 10]);
      aReady.resolve({ pid });
      await bounded(releaseA.promise, 12000, "Release connection A");
      throw rollbackA;
    }).catch(error => {
      aReady.resolve({ error });
      return error;
    }).finally(() => { aFinished = true; });

    try {
      const aPid = readyPid(await bounded(aReady.promise, 5000, "Acquire connection A"));
      b = bDb.transaction(async tx => {
        const pid = await connection(tx);
        expect(pid).not.toBe(aPid);
        bReady.resolve({ pid });
        try {
          // The real guard must wait for A before reading the canonical count.
          await assertOrganizationAthleteCapacity(tx, qaOrg,
            async (transaction, organizationId) =>
              (await resolveEffectiveOrganizationEntitlement(transaction, organizationId)).limits.athleteLimit);
          throw new Error("The full athlete cap unexpectedly allowed a creation");
        } catch (error) {
          guardError = error;
          expect(releasedA, "B must not finish its guard while A holds the lock").toBe(true);
          expect(error).toMatchObject({ code: "CAPACITY_FULL" });
        }
        throw rollbackB;
      }).catch(error => {
        bReady.resolve({ error });
        return error;
      }).finally(() => { bFinished = true; });

      const bPid = readyPid(await bounded(bReady.promise, 5000, "Acquire connection B"));
      const observerOutcome = await observerDb.transaction(async tx => {
        const observerPid = await connection(tx);
        expect(new Set([aPid, bPid, observerPid]).size).toBe(3);
        let blockedByA = false;
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline && !aFinished && !bFinished) {
          const row = (await tx.execute(sql`
            select pg_blocking_pids(${bPid}::int) as blockers
          `)).rows[0];
          expect(Array.isArray(row.blockers)).toBe(true);
          if ((row.blockers as number[]).includes(aPid)) {
            blockedByA = true;
            break;
          }
          await new Promise<void>(resolve => setTimeout(resolve, 25));
        }
        expect(blockedByA, "A must be observed blocking B; PIDs alone are insufficient").toBe(true);
        expect(aFinished).toBe(false);
        expect(bFinished).toBe(false);
        expect(releasedA).toBe(false);
        throw rollbackObserver;
      }).catch(error => error);
      expect(observerOutcome).toBe(rollbackObserver);
    } catch (error) {
      failure = error;
    } finally {
      // Release A even if acquiring B/C, SQL, assertions or observation fail.
      releasedA = true;
      releaseA.resolve();
      [aOutcome, bOutcome] = await Promise.all([a, b ?? Promise.resolve(undefined)]);
      signal.removeEventListener("abort", onAbort);
    }
    if (failure !== undefined) throw failure;
    expect(aOutcome).toBe(rollbackA);
    expect(bOutcome).toBe(rollbackB);
    expect(guardError).toMatchObject({ code: "CAPACITY_FULL" });
    }).catch(error => error);
    // Verify preservation even if acquisition, SQL or contention checks failed.
    expect(await readSnapshot(qaOrg)).toEqual(before);
    if (outcome !== undefined) throw outcome;
  }, 40000);

  it("resolves the real Stripe TEST Growth projection at end-1ms/end/end+1ms without changing stored periods or the global clock", async () => {
    target();
    const before = await readSnapshot(paidOrg, true);
    const rollback = new Error("ROLLBACK_PAID_BOUNDARY_READ_ONLY");
    const outcome = await withConnections(1, 12000, async ([database]) => database.transaction(async tx => {
      await connection(tx);
      const rows = (await tx.execute(sql`
        select e.plan_code, e.source, e.revision, e.effective_from, e.effective_until,
          e.subscription_id, e.trial_id, s.id as joined_subscription_id,
          s.provider, s.environment, s.plan_code as subscription_plan_code,
          s.provider_status, s.subscription_reference, s.current_period_started_at,
          s.current_period_ends_at, s.cancel_at_period_end
        from zaltyko.organization_entitlements e
        join zaltyko.organization_saas_subscriptions s
          on s.organization_id = e.organization_id and s.id = e.subscription_id
        where e.organization_id = ${paidOrg}::uuid
      `)).rows;
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toMatchObject({ plan_code: "growth", source: "stripe_subscription",
        revision: 3, trial_id: null, provider: "stripe", environment: "test",
        subscription_plan_code: "growth", provider_status: "active", cancel_at_period_end: true });
      expect(row.subscription_id).toBe(row.joined_subscription_id);
      expect(typeof row.subscription_reference).toBe("string");
      expect(String(row.subscription_reference).startsWith("sub_")).toBe(true);
      const end = new Date(row.effective_until as Date | string);
      const start = new Date(row.effective_from as Date | string);
      expect(Number.isFinite(end.getTime())).toBe(true);
      expect(Number.isFinite(start.getTime())).toBe(true);
      expect(start.getTime()).toBeLessThan(end.getTime() - 1);
      expect(new Date(row.current_period_ends_at as Date | string).getTime()).toBe(end.getTime());
      expect(new Date(row.current_period_started_at as Date | string).getTime()).toBeLessThan(end.getTime());
      for (const delta of [-1, 0, 1]) {
        const at = new Date(end.getTime() + delta);
        const result = await resolveEffectiveOrganizationEntitlement(tx, paidOrg, at);
        expect(result.revision).toBe(3);
        expect(result.planCode).toBe(delta < 0 ? "growth" : "free");
        expect(result.limits).toEqual(delta < 0
          ? { athleteLimit: 200, groupLimit: 10, classLimit: 40, academyLimit: 1 }
          : { athleteLimit: 30, groupLimit: 3, classLimit: 10, academyLimit: 1 });
        expect(result.source).toBe(delta < 0 ? "stripe_subscription" : "bootstrap");
        expect(result.effectiveUntil?.getTime() ?? null).toBe(delta < 0 ? end.getTime() : null);
        expect(result.effectiveFrom.getTime()).toBe(delta < 0 ? start.getTime() : at.getTime());
      }
      expect(await snapshot(tx, paidOrg, true)).toEqual(before);
      throw rollback;
    }, { accessMode: "read only", isolationLevel: "read committed" })).catch(error => error);
    expect(await readSnapshot(paidOrg, true)).toEqual(before);
    expect(outcome).toBe(rollback);
    // Contract-time resolver evidence only: not wall-clock or HTTP expiry E2E.
  }, 40000);
});
