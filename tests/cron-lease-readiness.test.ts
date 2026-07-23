import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: dbMock }));

import { runCronWithLease } from "@/lib/cron-lease";
import { getFeatureReadiness } from "@/lib/env";

describe("cron lease", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ejecuta el job solo cuando adquiere el advisory lock", async () => {
    dbMock.transaction.mockImplementation((callback) =>
      callback({ execute: vi.fn().mockResolvedValue({ rows: [{ acquired: true }] }) })
    );
    const job = vi.fn().mockResolvedValue("done");
    await expect(runCronWithLease("cron:test", job)).resolves.toEqual({
      acquired: true,
      value: "done",
    });
    expect(job).toHaveBeenCalledTimes(1);
  });

  it("omite una segunda ejecución concurrente", async () => {
    let call = 0;
    dbMock.transaction.mockImplementation((callback) => {
      call++;
      return callback({
        execute: vi.fn().mockResolvedValue({ rows: [{ acquired: call === 1 }] }),
      });
    });
    let release!: () => void;
    const firstJob = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const first = runCronWithLease("cron:test", firstJob);
    await Promise.resolve();
    const secondJob = vi.fn();
    await expect(runCronWithLease("cron:test", secondJob)).resolves.toEqual({ acquired: false });
    expect(secondJob).not.toHaveBeenCalled();
    release();
    await first;
  });
});

describe("transactional feature readiness", () => {
  it("reporta solo nombres faltantes, nunca valores", () => {
    const result = getFeatureReadiness("stripeConnectWebhook", {
      STRIPE_SECRET_KEY: "sk_test_secret",
    });
    expect(result).toEqual({ ready: false, missing: ["STRIPE_CONNECT_WEBHOOK_SECRET"] });
    expect(JSON.stringify(result)).not.toContain("sk_test_secret");
  });

  it("requiere el contrato completo de Brevo y KV", () => {
    expect(getFeatureReadiness("email", {})).toMatchObject({ ready: false });
    expect(
      getFeatureReadiness("rateLimit", {
        KV_REST_API_URL: "https://example.invalid",
        KV_REST_API_TOKEN: "token",
      })
    ).toEqual({ ready: true, missing: [] });
  });

  it("requiere la clave pública VAPID para servidor y navegador", () => {
    expect(
      getFeatureReadiness("push", {
        VAPID_PUBLIC_KEY: "server-public",
        VAPID_PRIVATE_KEY: "private",
        VAPID_SUBJECT: "mailto:ops@example.com",
      })
    ).toEqual({ ready: false, missing: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] });
  });
});
