import { describe, expect, it } from "vitest";

import {
  projectConnectAccount,
  projectionChanged,
  type ConnectAccountProjection,
  type ConnectAccountSnapshot,
} from "@/modules/payments-connect/domain/account-projection";

/**
 * Conectar Stripe (cobro automático, Fase 1): proyección pura de la cuenta v2
 * al estado que guarda Zaltyko. Solo datos sintéticos; sin Stripe ni base.
 */

type Entry = ConnectAccountSnapshot["requirementEntries"][number];

function snapshot(overrides: Partial<ConnectAccountSnapshot> = {}): ConnectAccountSnapshot {
  return {
    id: "acct_synthetic",
    closed: false,
    cardPaymentsStatus: "active",
    sepaDebitPaymentsStatus: "active",
    requirementEntries: [],
    ...overrides,
  };
}

const userPastDue: Entry = { deadlineStatus: "past_due", awaitingActionFrom: "user" };
const stripePastDue: Entry = { deadlineStatus: "past_due", awaitingActionFrom: "stripe" };
const userCurrentlyDue: Entry = { deadlineStatus: "currently_due", awaitingActionFrom: "user" };
const stripeCurrentlyDue: Entry = {
  deadlineStatus: "currently_due",
  awaitingActionFrom: "stripe",
};
const userEventuallyDue: Entry = { deadlineStatus: "eventually_due", awaitingActionFrom: "user" };
const stripeEventuallyDue: Entry = {
  deadlineStatus: "eventually_due",
  awaitingActionFrom: "stripe",
};

describe("projectConnectAccount", () => {
  it.each<{
    name: string;
    input: Partial<ConnectAccountSnapshot>;
    status: ConnectAccountProjection["status"];
    requirementsState: ConnectAccountProjection["requirementsState"];
  }>([
    {
      name: "cuenta cerrada",
      input: { closed: true, requirementEntries: [userPastDue, userCurrentlyDue] },
      status: "disabled",
      requirementsState: "none",
    },
    {
      name: "una entrada past_due que espera a la academia",
      input: { requirementEntries: [userPastDue] },
      status: "onboarding",
      requirementsState: "past_due",
    },
    {
      // R10: forma real de una cuenta v2 recién creada en el sandbox.
      name: "cuenta nueva: varias past_due de la academia con tarjeta y SEPA restricted",
      input: {
        cardPaymentsStatus: "restricted",
        sepaDebitPaymentsStatus: "restricted",
        requirementEntries: [userPastDue, userPastDue, userPastDue],
      },
      status: "onboarding",
      requirementsState: "past_due",
    },
    {
      name: "una past_due de la academia va antes que una currently_due de la academia",
      input: { cardPaymentsStatus: "pending", requirementEntries: [userCurrentlyDue, userPastDue] },
      status: "onboarding",
      requirementsState: "past_due",
    },
    {
      name: "una currently_due de la academia va antes que una past_due de Stripe",
      input: { cardPaymentsStatus: "pending", requirementEntries: [stripePastDue, userCurrentlyDue] },
      status: "onboarding",
      requirementsState: "user_action",
    },
    {
      name: "una entrada currently_due de la academia con tarjeta pending",
      input: { cardPaymentsStatus: "pending", requirementEntries: [userCurrentlyDue] },
      status: "onboarding",
      requirementsState: "user_action",
    },
    {
      name: "la academia va antes que Stripe entre las currently_due",
      input: {
        cardPaymentsStatus: "pending",
        requirementEntries: [stripeCurrentlyDue, userCurrentlyDue],
      },
      status: "onboarding",
      requirementsState: "user_action",
    },
    {
      name: "solo entradas currently_due de Stripe con tarjeta pending",
      input: { cardPaymentsStatus: "pending", requirementEntries: [stripeCurrentlyDue] },
      status: "onboarding",
      requirementsState: "stripe_review",
    },
    {
      name: "sin entradas exigibles, tarjeta active y SEPA pending",
      input: { cardPaymentsStatus: "active", sepaDebitPaymentsStatus: "pending" },
      status: "active",
      requirementsState: "none",
    },
    {
      name: "sin entradas y tarjeta restricted",
      input: { cardPaymentsStatus: "restricted" },
      status: "restricted",
      requirementsState: "none",
    },
    {
      name: "sin entradas y tarjeta unsupported",
      input: { cardPaymentsStatus: "unsupported" },
      status: "restricted",
      requirementsState: "none",
    },
    {
      name: "tarjeta active con una entrada currently_due de la academia",
      input: { cardPaymentsStatus: "active", requirementEntries: [userCurrentlyDue] },
      status: "onboarding",
      requirementsState: "user_action",
    },
    {
      name: "tarjeta active con solo entradas currently_due de Stripe",
      input: { cardPaymentsStatus: "active", requirementEntries: [stripeCurrentlyDue] },
      status: "onboarding",
      requirementsState: "stripe_review",
    },
    {
      name: "una entrada past_due que espera a Stripe",
      input: { requirementEntries: [stripePastDue] },
      status: "onboarding",
      requirementsState: "stripe_review",
    },
    {
      name: "una past_due de Stripe con tarjeta restricted (Stripe revisando)",
      input: { cardPaymentsStatus: "restricted", requirementEntries: [stripePastDue] },
      status: "onboarding",
      requirementsState: "stripe_review",
    },
    {
      name: "solo eventually_due con tarjeta restricted",
      input: { cardPaymentsStatus: "restricted", requirementEntries: [userEventuallyDue] },
      status: "restricted",
      requirementsState: "none",
    },
    {
      name: "solo entradas eventually_due con tarjeta active",
      input: {
        cardPaymentsStatus: "active",
        requirementEntries: [userEventuallyDue, stripeEventuallyDue],
      },
      status: "active",
      requirementsState: "none",
    },
    {
      name: "sin entradas exigibles y tarjeta pending (Stripe revisando)",
      input: { cardPaymentsStatus: "pending", requirementEntries: [userEventuallyDue] },
      status: "onboarding",
      requirementsState: "stripe_review",
    },
    {
      name: "sin entradas exigibles y tarjeta sin estado (null)",
      input: { cardPaymentsStatus: null },
      status: "onboarding",
      requirementsState: "stripe_review",
    },
  ])("$name → $status / $requirementsState", ({ input, status, requirementsState }) => {
    const projection = projectConnectAccount(snapshot(input));

    expect(projection.status).toBe(status);
    expect(projection.requirementsState).toBe(requirementsState);
  });

  it("conserva SEPA pending cuando la tarjeta ya está active", () => {
    const projection = projectConnectAccount(
      snapshot({ cardPaymentsStatus: "active", sepaDebitPaymentsStatus: "pending" })
    );

    expect(projection).toEqual({
      status: "active",
      cardPaymentsCapabilityStatus: "active",
      sepaDebitPaymentsCapabilityStatus: "pending",
      requirementsState: "none",
    });
  });

  it("proyecta las capacidades null como pending", () => {
    const projection = projectConnectAccount(
      snapshot({ cardPaymentsStatus: null, sepaDebitPaymentsStatus: null })
    );

    expect(projection.cardPaymentsCapabilityStatus).toBe("pending");
    expect(projection.sepaDebitPaymentsCapabilityStatus).toBe("pending");
  });

  it("nunca produce el estado pending del enum de base", () => {
    const cases: Array<Partial<ConnectAccountSnapshot>> = [
      { cardPaymentsStatus: null, sepaDebitPaymentsStatus: null },
      { cardPaymentsStatus: "pending" },
      { cardPaymentsStatus: "inactive" },
    ];

    for (const input of cases) {
      expect(projectConnectAccount(snapshot(input)).status).not.toBe("pending");
    }
  });
});

describe("projectionChanged", () => {
  const base: ConnectAccountProjection = {
    status: "active",
    cardPaymentsCapabilityStatus: "active",
    sepaDebitPaymentsCapabilityStatus: "pending",
    requirementsState: "none",
  };

  it("es false con dos proyecciones iguales", () => {
    expect(projectionChanged(base, { ...base })).toBe(false);
  });

  it.each<[string, Partial<ConnectAccountProjection>]>([
    ["status", { status: "restricted" }],
    ["cardPaymentsCapabilityStatus", { cardPaymentsCapabilityStatus: "restricted" }],
    ["sepaDebitPaymentsCapabilityStatus", { sepaDebitPaymentsCapabilityStatus: "active" }],
    ["requirementsState", { requirementsState: "user_action" }],
  ])("es true si solo cambia %s", (_field, change) => {
    expect(projectionChanged(base, { ...base, ...change })).toBe(true);
  });
});
