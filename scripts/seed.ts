/* eslint-disable no-console */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { plans, profiles, skillCatalog } from "@/db/schema";

const PLAN_SEEDS = [
  {
    code: "free" as const,
    athleteLimit: 50,
    priceEur: 0,
    stripePriceId: null,
  },
  {
    code: "pro" as const,
    athleteLimit: 200,
    priceEur: 1900,
    stripePriceId: process.env.SEED_STRIPE_PRICE_PRO ?? "price_pro_PLACEHOLDER",
  },
  {
    code: "premium" as const,
    athleteLimit: null,
    priceEur: 4900,
    stripePriceId: process.env.SEED_STRIPE_PRICE_PREMIUM ?? "price_premium_PLACEHOLDER",
  },
];

const SUPER_ADMIN_USER_ID =
  process.env.SEED_SUPER_ADMIN_USER_ID ?? "00000000-0000-0000-0000-000000000001";

async function seedPlans() {
  for (const seed of PLAN_SEEDS) {
    await db
      .insert(plans)
      .values({
        code: seed.code,
        athleteLimit: seed.athleteLimit,
        priceEur: seed.priceEur,
        stripePriceId: seed.stripePriceId,
      })
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          athleteLimit: seed.athleteLimit,
          priceEur: seed.priceEur,
          stripePriceId: seed.stripePriceId,
        },
      });
  }

  console.log("✓ Plans seeded");
}

async function seedAdminProfile() {
  await db
    .insert(profiles)
    .values({
      userId: SUPER_ADMIN_USER_ID,
      tenantId: null,
      name: "Super Admin",
      role: "admin",
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        tenantId: null,
        name: "Super Admin",
        role: "admin",
      },
    });

  console.log("✓ Admin profile ready", SUPER_ADMIN_USER_ID);
}

async function seedSkillCatalog() {
  const tenantId = process.env.SEED_TENANT_ID ?? "11111111-0000-0000-0000-000000000000";

  const skills = [
    {
      tenantId,
      apparatus: "suelo",
      skillCode: "FX-A1",
      name: "Rondada flick",
      description: "Combinación básica para secuencias acrobáticas.",
      difficulty: 2,
    },
    {
      tenantId,
      apparatus: "viga",
      skillCode: "BB-B1",
      name: "Giro completo",
      description: "Giro de 360º en viga con control de salida.",
      difficulty: 3,
    },
    {
      tenantId,
      apparatus: "barras",
      skillCode: "UB-C1",
      name: "Pak salto",
      description: "Transición alta entre barras.",
      difficulty: 4,
    },
  ];

  for (const skill of skills) {
    await db
      .insert(skillCatalog)
      .values({
        id: randomUUID(),
        ...skill,
      })
      .onConflictDoNothing();
  }

  console.log("✓ Skill catalog seeded (tenant:", tenantId, ")");
}

async function main() {
  await seedPlans();
  await seedAdminProfile();
  await seedSkillCatalog();
}

main()
  .then(() => {
    console.log("✅ Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seed failed", error);
    process.exit(1);
  });

