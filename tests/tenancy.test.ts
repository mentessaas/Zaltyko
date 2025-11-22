import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => {
  const { newDb } = require("pg-mem");
  const { drizzle } = require("drizzle-orm/node-postgres");

  const dbMem = newDb({ autoCreateForeignKeyIndices: true });
  const pg = dbMem.adapters.createPg();
  const identity = (value: unknown) => value;

  const pool = new pg.Pool();
  (pool as any).getTypeParser = () => identity;

  dbMem.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: () => randomUUID(),
  });

  dbMem.public.none(
    `CREATE TYPE "academy_type" AS ENUM ('artistica', 'ritmica', 'trampolin', 'general');`
  );

  const migrationsDir = path.resolve(__dirname, "../drizzle");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file: string) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const migrationSql = readFileSync(path.join(migrationsDir, file), "utf8")
      .replace(/CREATE EXTENSION[^;]+;/gi, "")
      .replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, "")
      .replace(/UPDATE "subscriptions"[\s\S]*?academy_id" IS NOT NULL;\s*/gi, "");
    dbMem.public.none(migrationSql);
  }

  dbMem.public.none(
    `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "can_login" boolean DEFAULT true;`
  );
  dbMem.public.none(
    `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_suspended" boolean DEFAULT false;`
  );

  const originalPoolQuery = pool.query.bind(pool);
  pool.query = ((config: any, values?: any, callback?: any) => {
    if (config && typeof config === "object") {
      const cloned = { ...config };
      delete cloned.rowMode;
      delete cloned.types;
      return originalPoolQuery(cloned, values, callback);
    }
    return originalPoolQuery(config, values, callback);
  }) as typeof pool.query;

  const originalConnect = pool.connect.bind(pool);
  pool.connect = (async (...args) => {
    const client = await originalConnect(...args);
    const originalClientQuery = client.query.bind(client);
    client.query = ((config: any, values?: any, callback?: any) => {
      if (config && typeof config === "object") {
        const cloned = { ...config };
        delete cloned.rowMode;
        delete cloned.types;
        return originalClientQuery(cloned, values, callback);
      }
      return originalClientQuery(config, values, callback);
    }) as typeof client.query;
    return client;
  }) as typeof pool.connect;

  const dbInstance = drizzle(pool);

  return {
    db: dbInstance,
  };
});

import { db } from "@/db";
import {
  academies,
  athletes,
  plans,
  profiles,
  subscriptions,
} from "@/db/schema";
import { assertWithinPlanLimits } from "@/lib/limits";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const PLAN_ID = "00000000-0000-0000-0000-0000000000aa";
const ACADEMY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACADEMY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROFILE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01";
const PROFILE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01";

describe("tenant isolation", () => {
  beforeEach(async () => {
    await db.delete(athletes);
  });

  beforeAll(async () => {
    await db.insert(plans).values({
      id: PLAN_ID,
      code: "free",
      athleteLimit: 50,
      priceEur: 0,
      stripePriceId: null,
      stripeProductId: null,
      currency: "eur",
      billingInterval: "month",
      nickname: "Free",
      isArchived: false,
    });

    await db.insert(profiles).values({
      id: PROFILE_A,
      userId: PROFILE_A,
      tenantId: TENANT_A,
      name: "Owner A",
      role: "owner",
    });

    await db.insert(profiles).values({
      id: PROFILE_B,
      userId: PROFILE_B,
      tenantId: TENANT_B,
      name: "Owner B",
      role: "owner",
    });

    await db.insert(academies).values({
      id: ACADEMY_A,
      tenantId: TENANT_A,
      name: "Academia A",
      ownerId: PROFILE_A,
    });

    await db.insert(academies).values({
      id: ACADEMY_B,
      tenantId: TENANT_B,
      name: "Academia B",
      ownerId: PROFILE_B,
    });

    await db.insert(subscriptions).values({
      id: randomUUID(),
      academyId: ACADEMY_A,
      planId: PLAN_ID,
      status: "active",
    });
  });

  it("permite operar dentro del mismo tenant", async () => {
    await expect(
      assertWithinPlanLimits(TENANT_A, ACADEMY_A, "athletes")
    ).resolves.not.toThrow();
  });

  it("bloquea acceso a academias de otro tenant", async () => {
    await expect(
      assertWithinPlanLimits(TENANT_A, ACADEMY_B, "athletes")
    ).rejects.toMatchObject({ status: 404 });
  });

});

