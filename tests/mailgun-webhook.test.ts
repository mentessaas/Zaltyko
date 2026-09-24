import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendEmail = vi.hoisted(() => vi.fn());
const claimWebhookReplay = vi.hoisted(() => vi.fn());
vi.mock("@/lib/brevo", () => ({ sendEmail }));
vi.mock("@/lib/webhook-replay", () => ({ claimWebhookReplay }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/mailgun/route";

function requestFor(timestamp: string, token = "mailgun-token") {
  const signature = createHmac("sha256", "mailgun-secret")
    .update(timestamp + token)
    .digest("hex");
  const body = new URLSearchParams({
    timestamp,
    token,
    signature,
    From: "Sender <sender@example.com>",
    Subject: "<script>alert(1)</script>",
    "body-html": "<img src=x onerror=alert(1)>",
  });
  return new NextRequest("http://localhost/api/mailgun", { method: "POST", body });
}

describe("legacy Mailgun inbound webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MAILGUN_SIGNING_KEY = "mailgun-secret";
    sendEmail.mockResolvedValue({ messageId: "message-1", simulated: false });
    claimWebhookReplay.mockResolvedValue("claimed");
  });
  afterEach(() => delete process.env.MAILGUN_SIGNING_KEY);

  it("rechaza timestamps fuera de la tolerancia aunque el HMAC sea válido", async () => {
    const old = String(Math.floor(Date.now() / 1000) - 301);
    const response = await POST(requestFor(old));
    expect(response.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("verifica HMAC, escapa contenido inbound y normaliza Reply-To", async () => {
    const response = await POST(requestFor(String(Math.floor(Date.now() / 1000))));
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "sender@example.com",
        html: expect.stringContaining("&lt;img src=x onerror=alert(1)&gt;"),
      })
    );
  });

  it("rechaza una entrega firmada repetida", async () => {
    claimWebhookReplay.mockResolvedValueOnce("claimed").mockResolvedValueOnce("duplicate");
    const request = requestFor(String(Math.floor(Date.now() / 1000)));
    const first = await POST(request);
    const second = await POST(requestFor(String(Math.floor(Date.now() / 1000))));
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
