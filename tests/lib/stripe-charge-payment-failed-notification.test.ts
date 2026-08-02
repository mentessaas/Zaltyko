import { beforeEach, describe, expect, it, vi } from "vitest";

const { recipients, sendEmailMock } = vi.hoisted(() => ({
  recipients: [] as Array<{ email: string | null }>,
  sendEmailMock: vi.fn(),
}));

vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(recipients));

  return {
    db: {
      select: vi.fn(() => chain),
    },
  };
});

vi.mock("@/lib/brevo", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("@/config", () => ({
  config: { brevo: { supportEmail: "soporte@example.test" } },
}));

import { sendChargePaymentFailedNotification } from "@/lib/stripe/notification-service";

const notification = {
  chargeId: "charge_1",
  tenantId: "tenant_1",
  academyId: "academy_1",
  athleteId: "athlete_1",
  amountCents: 5000,
  currency: "eur",
  paymentIntentId: "pi_1",
  failureReason: "card_declined",
};

beforeEach(() => {
  recipients.length = 0;
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ messageId: "message_1", simulated: false });
});

describe("sendChargePaymentFailedNotification", () => {
  it("envia una sola vez por tutor y escapa contenido controlado por Stripe", async () => {
    recipients.push(
      { email: "tutor@example.test" },
      { email: "tutor@example.test" },
      { email: "segundo@example.test" }
    );

    const sent = await sendChargePaymentFailedNotification({
      ...notification,
      failureReason: "<card_declined>",
    });

    expect(sent).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: "tutor@example.test",
        html: expect.stringContaining("&lt;card_declined&gt;"),
      })
    );
    expect(sendEmailMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: "segundo@example.test" })
    );
  });

  it("no inventa destinatario cuando el atleta no tiene tutor notificable", async () => {
    await expect(sendChargePaymentFailedNotification(notification)).resolves.toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("propaga el fallo de entrega para que Stripe reintente el webhook", async () => {
    recipients.push({ email: "tutor@example.test" });
    sendEmailMock.mockRejectedValueOnce(new Error("BREVO_API_ERROR:503"));

    await expect(sendChargePaymentFailedNotification(notification)).rejects.toThrow(
      "BREVO_API_ERROR:503"
    );
  });
});
