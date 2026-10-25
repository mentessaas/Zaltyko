import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateLimit, getUpgradeInfo } from "@/lib/limits";
import { PRODUCT_PLAN_BY_CODE } from "@/lib/plans/catalog";
import { getLimitForRoute, RATE_LIMITS } from "@/lib/rate-limit";
import { isFeatureEnabled } from "@/lib/product/features";

describe("API limits and feature contracts", () => {
  it("blocks the next athlete when Free is at its limit", () => {
    expect(evaluateLimit("free", 30, 30, "athletes")).toMatchObject({
      exceeded: true,
      upgradeTo: "pro",
    });
  });

  it("allows the final Starter athlete below the limit", () => {
    expect(evaluateLimit("pro", 75, 74, "athletes").exceeded).toBe(false);
  });

  it("blocks Growth once the configured athlete limit is reached", () => {
    expect(evaluateLimit("premium", 200, 200, "athletes").exceeded).toBe(true);
  });

  it("keeps Network unlimited only where the catalog says null", () => {
    expect(PRODUCT_PLAN_BY_CODE.network.athleteLimit).toBeNull();
    expect(PRODUCT_PLAN_BY_CODE.network.academyLimit).toBeNull();
  });

  it("uses the approved pricing v3 plan mapping", () => {
    expect(PRODUCT_PLAN_BY_CODE.free.publicName).toBe("Free");
    expect(PRODUCT_PLAN_BY_CODE.pro).toMatchObject({
      publicName: "Starter",
      priceEurCents: 1900,
    });
    expect(PRODUCT_PLAN_BY_CODE.premium).toMatchObject({
      publicName: "Growth",
      priceEurCents: 4900,
    });
  });

  it("does not promise unlimited academies in the Free upgrade", () => {
    const upgrade = getUpgradeInfo("free");
    expect(upgrade.nextPlan).toBe("pro");
    expect(upgrade.benefits.join(" ")).not.toMatch(/academias ilimitadas/i);
  });

  it("applies strict route budgets to billing and imports", () => {
    expect(getLimitForRoute("/api/billing/checkout")).toEqual({
      limit: 10,
      window: 60,
    });
    expect(getLimitForRoute("/api/athletes/import")).toEqual({
      limit: 5,
      window: 60,
    });
  });

  it("keeps webhook capacity separate from user mutations", () => {
    expect(getLimitForRoute("/api/stripe/webhook")).toEqual({
      limit: 1000,
      window: 60,
    });
    expect(RATE_LIMITS.CRITICAL.limit).toBeLessThan(RATE_LIMITS.WEBHOOK.limit);
  });

  it("fails closed on feature surfaces intentionally disabled in v1", () => {
    expect(isFeatureEnabled("paymentMethods")).toBe(false);
    expect(isFeatureEnabled("communicationTemplateUse")).toBe(false);
  });

  it("checks athlete limits before inserting a new athlete", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/athletes/route.ts"),
      "utf8"
    );
    expect(route.indexOf("assertWithinPlanLimits")).toBeLessThan(
      route.indexOf("tx.insert(athletes)")
    );
  });

  it("checks class limits before inserting a class", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/classes/route.ts"),
      "utf8"
    );
    expect(route.indexOf("assertWithinPlanLimits")).toBeLessThan(
      route.indexOf("tx.insert(classes)")
    );
  });

  it("serializes capacity checks for athlete, group, and class creation", () => {
    const routes = [
      ["src/app/api/athletes/route.ts", "tx.insert(athletes)"] as const,
      ["src/app/api/groups/route.ts", ".insert(groups)"] as const,
      ["src/app/api/classes/route.ts", "tx.insert(classes)"] as const,
    ];

    for (const [path, writeExpression] of routes) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      const transaction = source.indexOf("withTransaction(async (tx) =>");
      const lock = source.indexOf("lockAcademyOperationalWrites(tx", transaction);
      const capacityCheck = source.indexOf("assertWithinPlanLimits(", lock);
      const write = source.indexOf(writeExpression, capacityCheck);

      expect(transaction, `${path} creates inside a transaction`).toBeGreaterThanOrEqual(0);
      expect(lock, `${path} locks the academy before counting`).toBeGreaterThan(transaction);
      expect(capacityCheck, `${path} checks all plan limits after the lock`).toBeGreaterThan(lock);
      expect(write, `${path} writes only after the final capacity check`).toBeGreaterThan(capacityCheck);
    }
  });

  it("guards legacy operational writes under the academy lock", () => {
    const routes = [
      ["src/app/api/attendance/route.ts", ".insert(attendanceRecords)"] as const,
      ["src/app/api/charges/route.ts", ".insert(charges)"] as const,
      ["src/app/api/charges/bulk/route.ts", ".insert(charges)"] as const,
      ["src/app/api/charges/generate-monthly/route.ts", ".insert(charges)"] as const,
      ["src/app/api/quick-actions/record-payment/route.ts", ".update(charges)"] as const,
      ["src/app/api/classes/[classId]/route.ts", ".update(classes)"] as const,
      ["src/app/api/groups/[groupId]/route.ts", ".update(groups)"] as const,
      ["src/app/api/athletes/[athleteId]/route.ts", ".update(athletes)"] as const,
      ["src/app/api/class-enrollments/route.ts", ".insert(classEnrollments)"] as const,
      ["src/app/api/assessments/route.ts", ".insert(athleteAssessments)"] as const,
      ["src/app/api/assessments/[athleteId]/route.ts", ".insert(athleteAssessments)"] as const,
      ["src/app/api/classes/[classId]/generate-sessions/route.ts", "generateRecurringSessions("] as const,
      ["src/app/api/classes/[classId]/recurring-settings/route.ts", ".update(classes)"] as const,
      ["src/app/api/classes/[classId]/exceptions/route.ts", "tx.insert(classExceptions)"] as const,
      ["src/app/api/classes/[classId]/exceptions/[exceptionId]/route.ts", "tx.delete(classExceptions)"] as const,
      ["src/app/api/athletes/import/route.ts", "tx.insert(athletes)"] as const,
      ["src/app/api/class-sessions/route.ts", ".insert(classSessions)"] as const,
      ["src/app/api/class-sessions/[sessionId]/route.ts", ".update(classSessions)"] as const,
      ["src/app/api/quick-actions/create-class/route.ts", ".insert(classSessions)"] as const,
      ["src/app/api/class-waiting-list/route.ts", "tx.insert(classWaitingList)"] as const,
      ["src/lib/classes/promote-waiting-list.ts", "tx.insert(classEnrollments)"] as const,
      ["src/app/api/class-waiting-list/[entryId]/route.ts", "tx.delete(classWaitingList)"] as const,
    ];

    for (const [path, writeExpression] of routes) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      const transaction = source.indexOf("withTransaction(async (tx) =>");
      const lock = source.indexOf("lockAcademyOperationalWrites(tx", transaction);
      const writable = source.indexOf("assertAcademyOperationalWritable(", lock);
      const write = source.indexOf(writeExpression, writable);

      expect(transaction, `${path} has an atomic write transaction`).toBeGreaterThanOrEqual(0);
      expect(lock, `${path} locks the academy before checking usage`).toBeGreaterThan(transaction);
      expect(writable, `${path} checks read-only policy after the lock`).toBeGreaterThan(lock);
      expect(write, `${path} checks policy before its write`).toBeGreaterThan(writable);
    }
  });

  it("guards scheduled session generation and destructive cleanup before writes", () => {
    const checks = [
      {
        path: "src/lib/generate-class-sessions.ts",
        start: "export async function generateClassSessions(",
        write: "tx.insert(classSessions)",
      },
      {
        path: "src/app/api/groups/[groupId]/route.ts",
        start: "const deleteGroupHandler",
        write: "tx.delete(groups)",
      },
      {
        path: "src/app/api/classes/[classId]/route.ts",
        start: "export const DELETE = withTenant",
        write: ".delete(classes)",
      },
    ] as const;

    for (const { path, start, write: writeExpression } of checks) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      const handler = source.indexOf(start);
      const transaction = source.indexOf("withTransaction(async (tx) =>", handler);
      const lock = source.indexOf("lockAcademyOperationalWrites(tx", transaction);
      const writable = source.indexOf("assertAcademyOperationalWritable(", lock);
      const write = source.indexOf(writeExpression, writable);

      expect(handler, `${path} locates the intended handler`).toBeGreaterThanOrEqual(0);
      expect(transaction, `${path} uses a transaction`).toBeGreaterThan(handler);
      expect(lock, `${path} locks before checking usage`).toBeGreaterThan(transaction);
      expect(writable, `${path} enforces read-only before the write`).toBeGreaterThan(lock);
      expect(write, `${path} performs its write after the guard`).toBeGreaterThan(writable);
    }
  });

  it("guards secondary academy writes and keeps multi-row mutations atomic", () => {
    const guardedWrites = [
      {
        path: "src/app/api/athletes/[athleteId]/extra-classes/route.ts",
        handler: "export const POST =",
        write: "tx.insert(athleteExtraClasses)",
      },
      {
        path: "src/app/api/athletes/[athleteId]/extra-classes/route.ts",
        handler: "export const DELETE =",
        write: ".delete(athleteExtraClasses)",
      },
      {
        path: "src/app/api/athletes/[athleteId]/documents/route.ts",
        handler: "export const POST =",
        write: ".insert(athleteDocuments)",
      },
      {
        path: "src/app/api/athletes/[athleteId]/documents/route.ts",
        handler: "export const DELETE =",
        write: ".delete(athleteDocuments)",
      },
      {
        path: "src/app/api/athletes/[athleteId]/guardians/route.ts",
        handler: "const createGuardianHandler",
        write: "tx.insert(guardians)",
      },
      {
        path: "src/app/api/athletes/[athleteId]/guardians/[linkId]/route.ts",
        handler: "export const PATCH =",
        write: ".update(familyContacts)",
      },
      {
        path: "src/app/api/athletes/[athleteId]/guardians/[linkId]/route.ts",
        handler: "export const DELETE =",
        write: ".delete(familyContacts)",
      },
      {
        path: "src/app/api/guardians/route.ts",
        handler: "export const POST =",
        write: "tx.insert(guardians)",
      },
      {
        path: "src/app/api/guardians/route.ts",
        handler: "export const POST =",
        write: "tx.insert(guardianAthletes)",
      },
    ] as const;

    for (const { path, handler: handlerMarker, write: writeExpression } of guardedWrites) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      const handler = source.indexOf(handlerMarker);
      const transaction = source.indexOf("withTransaction(async (tx) =>", handler);
      const lock = source.indexOf("lockAcademyOperationalWrites(tx", transaction);
      const writable = source.indexOf("assertAcademyOperationalWritable(", lock);
      const write = source.indexOf(writeExpression, writable);

      expect(handler, `${path} locates the intended handler`).toBeGreaterThanOrEqual(0);
      expect(transaction, `${path} wraps the mutation atomically`).toBeGreaterThan(handler);
      expect(lock, `${path} serializes writes for this academy`).toBeGreaterThan(transaction);
      expect(writable, `${path} checks over-capacity before mutation`).toBeGreaterThan(lock);
      expect(write, `${path} mutates only after the guard`).toBeGreaterThan(writable);
    }
  });

  it("guards storage uploads and family conversation writes before external or relational effects", () => {
    const cases = [
      {
        path: "src/app/api/athletes/[athleteId]/documents/upload/route.ts",
        transactionMarker: "const uploaded = await withTransaction(async (tx) =>",
        writes: ["await uploadFile(file, path"],
      },
      {
        path: "src/app/api/athletes/[athleteId]/family-conversation/route.ts",
        transactionMarker: "const ensured = await withTransaction(async (tx) =>",
        writes: [".insert(conversations)", ".insert(conversationParticipants)"],
      },
      {
        path: "src/app/api/groups/[groupId]/family-conversation/route.ts",
        transactionMarker: "const ensured = await withTransaction(async (tx) =>",
        writes: [".insert(conversations)", ".insert(conversationParticipants)"],
      },
    ] as const;

    for (const { path, transactionMarker, writes } of cases) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      const transaction = source.indexOf(transactionMarker);
      const lock = source.indexOf("lockAcademyOperationalWrites(tx", transaction);
      const writable = source.indexOf("assertAcademyOperationalWritable(", lock);

      expect(transaction, `${path} wraps effects in one transaction`).toBeGreaterThanOrEqual(0);
      expect(lock, `${path} takes the academy lock first`).toBeGreaterThan(transaction);
      expect(writable, `${path} rejects over-capacity writes`).toBeGreaterThan(lock);

      for (const writeExpression of writes) {
        const write = source.indexOf(writeExpression, writable);
        expect(write, `${path} performs ${writeExpression} after the guard`).toBeGreaterThan(writable);
      }
    }
  });

  it("guards academy messaging writes and commits each conversation operation atomically", () => {
    const checks = [
      {
        path: "src/app/api/messages/send/route.ts",
        transactionMarker: "const sent = await withTransaction(async (tx) =>",
        write: ".insert(conversationMessages)",
      },
      {
        path: "src/app/api/messages/conversations/route.ts",
        transactionMarker: "const created = await withTransaction(async (tx) =>",
        write: ".insert(conversations)",
      },
      {
        path: "src/app/api/messages/conversations/[id]/messages/route.ts",
        transactionMarker: "const sent = await withTransaction(async (tx) =>",
        write: ".insert(conversationMessages)",
      },
      {
        path: "src/app/api/messages/conversations/[id]/route.ts",
        transactionMarker: "const updated = await withTransaction(async (tx) =>",
        write: ".update(conversations)",
      },
    ] as const;

    for (const { path, transactionMarker, write } of checks) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      const transaction = source.indexOf(transactionMarker);
      const guard = source.indexOf("assertAcademyOperationalWritable(", transaction);
      const mutation = source.indexOf(write, transaction);

      expect(transaction, `${path} wraps the academy mutation atomically`).toBeGreaterThanOrEqual(0);
      expect(guard, `${path} rejects over-capacity academy writes`).toBeGreaterThan(transaction);
      expect(mutation, `${path} performs the write inside the transaction`).toBeGreaterThan(transaction);
      if (path !== "src/app/api/messages/conversations/[id]/route.ts") {
        const lock = source.indexOf("lockAcademyOperationalWrites(tx", transaction);
        expect(lock, `${path} serializes writes with the academy limit`).toBeGreaterThan(transaction);
        expect(guard, `${path} checks policy after acquiring the lock`).toBeGreaterThan(lock);
      }
      expect(mutation, `${path} writes only after checking policy`).toBeGreaterThan(guard);
    }
  });

  it("checks capacity before athlete invitation delivery and profile completion", () => {
    const invitationService = readFileSync(
      join(process.cwd(), "src/lib/athletes/magic-link-invite-service.ts"),
      "utf8"
    );
    expect(invitationService.indexOf("assertWithinPlanLimits(")).toBeLessThan(
      invitationService.indexOf("for (const { original, email } of normalizedFull)")
    );

    const profileCompletion = readFileSync(
      join(process.cwd(), "src/app/api/athletes/invite/complete-profile/route.ts"),
      "utf8"
    );
    const lock = profileCompletion.indexOf("lockAcademyOperationalWrites(tx");
    const writable = profileCompletion.indexOf("assertAcademyOperationalWritable(", lock);
    const capacity = profileCompletion.indexOf('"athletes", tx', writable);
    const write = profileCompletion.indexOf(".insert(athletes)", capacity);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(writable).toBeGreaterThan(lock);
    expect(capacity).toBeGreaterThan(writable);
    expect(write).toBeGreaterThan(capacity);
  });

  it("guards the extra-class server action inside the class capacity transaction", () => {
    const action = readFileSync(
      join(process.cwd(), "src/app/actions/classes/create-extra-class.ts"),
      "utf8"
    );
    const transaction = action.indexOf("withTransaction(async (tx) =>");
    const lock = action.indexOf("lockAcademyOperationalWrites(tx", transaction);
    const capacity = action.indexOf('assertWithinPlanLimits(tenantId, body.academyId, "classes", tx)', lock);
    const write = action.indexOf("tx.insert(classes)", capacity);

    expect(transaction, "extra class uses a transaction").toBeGreaterThanOrEqual(0);
    expect(lock, "extra class locks its academy before counting").toBeGreaterThan(transaction);
    expect(capacity, "extra class checks the class limit after the lock").toBeGreaterThan(lock);
    expect(write, "extra class writes only after the capacity check").toBeGreaterThan(capacity);
  });

  it("serializes subscription plan/status webhooks with legacy academy writes", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/stripe/subscription-service.ts"),
      "utf8"
    );
    const handler = service.indexOf("export async function handleSubscriptionEvent");
    const transaction = service.indexOf("withTransaction(async (tx) =>", handler);
    const context = service.indexOf("getAcademyContextFromSubscription(canonicalSubscription, tx)", transaction);
    const capacityLock = service.indexOf("await lockSubscriptionAcademies(tx, context)", context);
    const write = service.indexOf("updateSubscriptionRecord(canonicalSubscription, context.userId, event, tx)", capacityLock);

    expect(handler, "subscription handler exists").toBeGreaterThanOrEqual(0);
    expect(transaction, "webhook updates in a transaction").toBeGreaterThan(handler);
    expect(context, "webhook resolves the owner in its transaction").toBeGreaterThan(transaction);
    expect(capacityLock, "webhook locks affected academies before updating the plan").toBeGreaterThan(context);
    expect(write, "webhook persists status only after capacity locks").toBeGreaterThan(capacityLock);
  });

  it("serializes capacity decisions with the effective owner subscription", () => {
    const limits = readFileSync(join(process.cwd(), "src/lib/limits.ts"), "utf8");
    const guard = limits.indexOf("export async function assertAcademyOperationalWritable(");
    const planLock = limits.indexOf("lockAcademySubscriptionStatus(client, tenantId, academyId)", guard);
    const usage = limits.indexOf("getAcademyOperationalUsage(tenantId, academyId, client)", planLock);
    const sharedUserLock = limits.indexOf("select pg_advisory_xact_lock(hashtext(${userId}))");

    expect(guard).toBeGreaterThanOrEqual(0);
    expect(planLock).toBeGreaterThan(guard);
    expect(usage).toBeGreaterThan(planLock);
    expect(sharedUserLock).toBeGreaterThanOrEqual(0);
  });

  it("guards cross-academy guardian mutations and sport migration writes", () => {
    const guardianRoute = readFileSync(
      join(process.cwd(), "src/app/api/guardians/[guardianId]/route.ts"),
      "utf8"
    );
    for (const [handlerName, write] of [
      ["export const PUT =", ".update(guardians)"],
      ["export const DELETE =", ".delete(guardians)"],
    ] as const) {
      const handler = guardianRoute.indexOf(handlerName);
      const transaction = guardianRoute.indexOf("withTransaction(async (tx) =>", handler);
      const guard = guardianRoute.indexOf("lockWritableGuardianAcademies(tx", transaction);
      const mutation = guardianRoute.indexOf(write, guard);
      expect(transaction, `${handlerName} uses a transaction`).toBeGreaterThan(handler);
      expect(guard, `${handlerName} checks linked academy scopes`).toBeGreaterThan(transaction);
      expect(mutation, `${handlerName} mutates after capacity guards`).toBeGreaterThan(guard);
    }

    const sportMigration = readFileSync(
      join(process.cwd(), "src/app/api/academies/[academyId]/sport-migration/route.ts"),
      "utf8"
    );
    const handler = sportMigration.indexOf("export const POST =");
    const transaction = sportMigration.indexOf("withTransaction(async (tx) =>", handler);
    const academyLock = sportMigration.indexOf("lockAcademyOperationalWrites(tx", transaction);
    const guard = sportMigration.indexOf("assertAcademyOperationalWritable(", academyLock);
    const mutation = sportMigration.indexOf(".update(athletes)", guard);
    expect(transaction).toBeGreaterThan(handler);
    expect(academyLock).toBeGreaterThan(transaction);
    expect(guard).toBeGreaterThan(academyLock);
    expect(mutation).toBeGreaterThan(guard);
  });

  it("checks onboarding starter presets before creating a Free academy", () => {
    const onboarding = readFileSync(
      join(process.cwd(), "src/app/api/onboarding/owner/route.ts"),
      "utf8"
    );
    const groupCheck = onboarding.indexOf("starterGroupCount > subscription.groupLimit");
    const classCheck = onboarding.indexOf("starterClassCount > subscription.classLimit");
    const academyCreation = onboarding.indexOf("const result = await createAcademy(");

    expect(groupCheck).toBeGreaterThanOrEqual(0);
    expect(classCheck).toBeGreaterThanOrEqual(0);
    expect(groupCheck).toBeLessThan(academyCreation);
    expect(classCheck).toBeLessThan(academyCreation);
  });

  it("fails closed in production when KV is unavailable", () => {
    const rateLimit = readFileSync(
      join(process.cwd(), "src/lib/rate-limit.ts"),
      "utf8"
    );
    expect(rateLimit).toContain('process.env.NODE_ENV === "production"');
    expect(rateLimit).toContain("success: false");
    expect(rateLimit).toContain(
      "Rate limiting unavailable: Vercel KV is not configured"
    );
  });
});
