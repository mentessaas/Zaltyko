import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  blocked: vi.fn(),
  send: vi.fn(),
  isTest: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock("@/lib/academy-status", () => ({
  isAcademyBlockedFromSending: mocks.blocked,
}));

vi.mock("@/lib/email/email-service", () => ({
  sendEmailWithLogging: mocks.send,
}));

vi.mock("@/lib/env", () => ({
  isTest: mocks.isTest,
}));

import { sendOnboardingOwnerStep } from "@/lib/onboarding-owner-integration";

const ACADEMY_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-28T20:00:00.000Z");

function queryResolvingTo(value: unknown) {
  const query: Record<string, unknown> = {
    from: vi.fn(() => query),
    innerJoin: vi.fn(() => query),
    leftJoin: vi.fn(() => query),
    where: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    limit: vi.fn(() => query),
    values: vi.fn(() => query),
    onConflictDoNothing: vi.fn(() => query),
  };
  Object.defineProperty(query, "then", {
    value: (onFulfilled: (result: unknown) => unknown) =>
      Promise.resolve(value).then(onFulfilled),
  });
  return query;
}

function queueSelectResults(...values: unknown[]) {
  for (const value of values) {
    mocks.select.mockImplementationOnce(() => queryResolvingTo(value));
  }
}

const owner = {
  academyId: ACADEMY_ID,
  tenantId: "22222222-2222-4222-8222-222222222222",
  academyName: "Academia Sintética",
  ownerId: "33333333-3333-4333-8333-333333333333",
  ownerProfileId: "33333333-3333-4333-8333-333333333333",
  ownerUserId: "44444444-4444-4444-8444-444444444444",
  ownerEmail: "owner@sandbox.example",
  ownerFirstName: "Owner",
  ownerLanguage: "es",
};

describe("onboarding owner integration behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://sandbox.zaltyko.com";
    process.env.UNSUBSCRIBE_HMAC_SECRET = "synthetic-test-secret-long";
    process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED = "true";
    mocks.isTest.mockReturnValue(false);
    mocks.send.mockResolvedValue(true);
    mocks.insert.mockImplementation(() => queryResolvingTo([]));
    mocks.blocked.mockResolvedValue({
      blocked: false,
      reason: null,
      status: "trial",
      isFraudHold: false,
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.UNSUBSCRIBE_HMAC_SECRET;
    delete process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED;
  });

  it("mantiene d0 desactivado sin consultar DB ni Brevo", async () => {
    process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED = "false";

    await expect(
      sendOnboardingOwnerStep({ academyId: ACADEMY_ID, step: "d0", now: NOW })
    ).resolves.toMatchObject({
      outcome: "disabled",
      reason: "SEQUENCE_DISABLED_BY_ENV",
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("renderiza d0 con siguiente paso y enlaces firmados allowlisted", async () => {
    queueSelectResults(
      [owner],
      [],
      [
        {
          key: "add_5_athletes",
          label: "Añade al menos 5 atletas",
          description: "Carga datos sintéticos",
          status: "pending",
        },
      ]
    );

    const result = await sendOnboardingOwnerStep({
      academyId: ACADEMY_ID,
      step: "d0",
      now: NOW,
    });

    expect(result).toMatchObject({
      outcome: "sent",
      nextStepKey: "add_5_athletes",
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const email = mocks.send.mock.calls[0]?.[0] as {
      html: string;
      metadata: { nextStepUrl: string; locale: string };
    };
    expect(email.metadata.nextStepUrl).toBe(
      `https://sandbox.zaltyko.com/app/${ACADEMY_ID}/athletes/new`
    );
    expect(email.metadata.locale).toBe("es");
    expect(email.html).toContain("/preferences?token=");
    expect(email.html).toContain("/unsubscribe?token=");
    expect(email.html).not.toContain("evil.example");
  });

  it("bloquea fraud_hold y nunca limpia el estado ni llama a Brevo", async () => {
    queueSelectResults([owner]);
    mocks.blocked.mockResolvedValue({
      blocked: true,
      reason: "fraud_hold",
      status: "fraud_hold",
      isFraudHold: true,
    });

    const result = await sendOnboardingOwnerStep({
      academyId: ACADEMY_ID,
      step: "d2",
      now: NOW,
    });

    expect(result).toMatchObject({
      outcome: "skipped",
      reason: "ACADEMY_FRAUD_HOLD",
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
