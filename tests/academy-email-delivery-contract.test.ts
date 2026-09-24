import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("academy email delivery contracts", () => {
  it("binds welcome email requests to the authenticated user and membership", () => {
    const source = readFileSync(
      "src/app/api/onboarding/welcome-email/route.ts",
      "utf8"
    );

    expect(source).toContain("body.data.userId !== userId");
    expect(source).toContain("memberships.userId, userId");
    expect(source).toContain("sendEmailWithLogging");
    expect(source).toContain('template: "academy-welcome"');
  });

  it("routes event fan-out through the shared sender with academy context", () => {
    const source = readFileSync(
      "src/lib/notifications/email-service.ts",
      "utf8"
    );
    const notifier = readFileSync(
      "src/lib/notifications/eventsNotifier.ts",
      "utf8"
    );

    expect(source).toContain("sendEmailWithLogging");
    expect(notifier).toContain("academyId,");
    expect(notifier).toContain("dedupeKeyPrefix");
  });

  it("blocks payment failure email delivery for semantically blocked academies", () => {
    const source = readFileSync(
      "src/lib/stripe/notification-service.ts",
      "utf8"
    );

    expect(source).toContain("isAcademyBlockedFromSending");
    expect(source).toContain("Charge failure email omitted: academy is not eligible");
  });
});
