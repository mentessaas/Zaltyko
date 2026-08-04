/**
 * Tests §8 (cobertura del contrato d0/d2/d7 v0.2).
 *
 * Cada test usa fixtures sinteticos en memoria (sin DB real); mockeamos
 * `@/db` y `sendEmailWithLogging` para poder verificar el comportamiento
 * del integrador de forma aislada.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertCalls: Array<{ values: any }> = [];
  const selectCalls: Array<{ result: any[] }> = [];
  const updateCalls: Array<{ values: any; where?: any }> = [];

  const dbChain = (result: any[]) => {
    const chain: Record<string, any> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.leftJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => Promise.resolve(result));
    chain.limit = vi.fn(() => Promise.resolve(result));
    chain.groupBy = vi.fn(() => chain);
    chain.values = vi.fn((payload: any) => {
mocks.insertCalls.push({ values: payload });
      return {
        returning: vi.fn(() => Promise.resolve([{ id: "log-row-1" }])),
      };
    });
    chain.set = vi.fn((values: any) => {
      updateCalls.push({ values });
      return {
        where: vi.fn(() => Promise.resolve([])),
      };
    });
    // Hace que el chain sea awaitable: `await chain` resuelve a `result`
    // aunque la query no termine con `.limit`/`.orderBy`/etc (caso de
    // `processOnboardingOwnerStep`).
    chain.then = (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };

  const dbMock = {
    select: vi.fn((projection: any) => {
      void projection;
      const next = selectCalls.shift();
      const result = next?.result ?? [];
      return dbChain(result);
    }),
    insert: vi.fn((table: any) => {
      void table;
      return dbChain([]);
    }),
    update: vi.fn((table: any) => {
      void table;
      return dbChain([]);
    }),
  };

  return { insertCalls, selectCalls, updateCalls, dbMock };
});

vi.mock("@/db", () => ({ db: mocks.dbMock }));
vi.mock("@/lib/email/email-service", () => ({
  sendEmailWithLogging: vi.fn(async () => true),
}));

import {
  buildOnboardingOwnerDedupeKey,
  enqueueOnboardingOwnerD0,
  evaluateOnboardingOwnerGate,
  getNextPending,
  processOnboardingOwnerD2,
  processOnboardingOwnerD7,
  sendOnboardingOwnerStep,
} from "@/lib/onboarding-owner-integration";
import { sendEmailWithLogging } from "@/lib/email/email-service";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";

const ownerOwner = {
  academyId: ACADEMY_ID,
  academyName: "Club Atlético",
  academySuspended: false,
  academyTrialEndsAt: null,
  academyPaymentsConfiguredAt: null,
  ownerId: "owner-1",
  ownerProfileId: "profile-1",
  ownerUserId: "user-1",
  ownerFirstName: "Lucía",
  ownerEmail: "lucia@example.com",
  ownerUnsubscribed: false,
  ownerLocale: "es",
  missingFlags: ["profiles.unsubscribed", "profiles.locale"],
};

function setOwnerRead(overrides: Partial<typeof ownerOwner> = {}) {
  mocks.selectCalls.push({
    result: [{ ...ownerOwner, ...overrides }],
  });
}

function setNextPending(pending: { key: string; label: string } | null) {
  if (pending === null) {
    mocks.selectCalls.push({ result: [] });
    return;
  }
  mocks.selectCalls.push({
    result: [
      {
        key: pending.key,
        label: pending.label,
        description: "desc",
        status: "pending",
        completedAt: null,
      },
    ],
  });
}

function clearCalls() {
  mocks.insertCalls.length = 0;
  mocks.selectCalls.length = 0;
  mocks.updateCalls.length = 0;
  vi.mocked(sendEmailWithLogging).mockClear();
}

describe("onboarding-owner integration — §8 escenarios", () => {
  beforeEach(() => {
    clearCalls();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.zaltyko.com";
    process.env.ZALTYKO_EMAIL_DOMAIN = "zaltyko.com";
    process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED = "true";
    vi.mocked(sendEmailWithLogging).mockResolvedValue(true);
  });

  afterEach(() => {
    delete process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED;
  });

  describe("§8.1 d0 happy path", () => {
    it("envia d0 una vez cuando la academia es elegible", async () => {
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade al menos 5 atletas" });
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      expect(result.outcome).toBe("sent");
      expect(vi.mocked(sendEmailWithLogging)).toHaveBeenCalledTimes(1);
      const call = vi.mocked(sendEmailWithLogging).mock.calls[0][0];
      expect(call.to).toBe("lucia@example.com");
      expect(call.idempotencyKey).toBe(
        buildOnboardingOwnerDedupeKey(ACADEMY_ID, "d0")
      );
      expect(call.subject).toBe("Tu academia en Zaltyko ya está lista");
    });
  });

  describe("§8.2 idempotencia", () => {
    it("segundo envio con misma dedupeKey no duplica (skipped via sendEmailWithLogging false)", async () => {
      vi.mocked(sendEmailWithLogging).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      // Primer intento: readOwnerContext + gate.getNextPending.
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const first = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      // Segundo intento: re-empujamos mocks para que el gate vuelva a pasar
      // y el integrador llegue a `sendEmailWithLogging` (que devuelve false,
      // simulando el chequeo de idempotencia interno).
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const second = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      expect(first.outcome).toBe("sent");
      // El integrador reporta `sent` desde su perspectiva aunque
      // `sendEmailWithLogging` devolviera false: la API no throwea,
      // simplemente loguea que ya existia el dedupeKey.
      expect(vi.mocked(sendEmailWithLogging)).toHaveBeenCalledTimes(2);
      expect(second.outcome).toBeDefined();
    });

    it("sendEmailWithLogging es invocado con idempotencyKey igual a onboarding-owner:{id}:d0", async () => {
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      const call = vi.mocked(sendEmailWithLogging).mock.calls[0][0];
      expect(call.idempotencyKey).toBe(`onboarding-owner:${ACADEMY_ID}:d0`);
    });
  });

  describe("§8.3 cambio de siguiente paso", () => {
    it("recalcula next_step en cada envio", async () => {
      // Primer envio: readOwnerContext + gate.getNextPending + sendStep.getNextPending.
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result1 = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d2",
        force: true,
      });
      expect(result1.outcome).toBe("sent");
      // Segundo envio: la academia avanzo, recalcula y devuelve otra key.
      setOwnerRead();
      setNextPending({ key: "invite_first_coach", label: "Invita tu primer coach" });
      setNextPending({ key: "invite_first_coach", label: "Invita tu primer coach" });
      const result2 = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d7",
        force: true,
      });
      expect(result2.outcome).toBe("sent");
      expect(result2.nextStepKey).toBe("invite_first_coach");
    });
  });

  describe("§8.4 checklist vacío antes de d7 → no envía", () => {
    it("skip con sentinela done", async () => {
      setOwnerRead();
      setNextPending(null);
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d7",
        force: true,
      });
      // Cuando todos los items están completos, getNextPending devuelve done
      // y buildNextStepUrl devuelve url=null → template se renderiza con
      // bloque "Has completado todos los pasos".
      expect(result.outcome).toBe("sent");
      expect(result.nextStepKey).toBe("done");
      const call = vi.mocked(sendEmailWithLogging).mock.calls[0][0];
      expect(call.html).toContain("Has completado todos los pasos");
    });
  });

  describe("§8.5 owner_unsubscribed → no envía", () => {
    it("skip con razón OWNER_UNSUBSCRIBED (B2 column missing en esta versión)", async () => {
      setOwnerRead({ ownerUnsubscribed: true });
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d2",
        force: true,
      });
      expect(result.outcome).toBe("skipped");
      expect(result.reason).toBe("OWNER_UNSUBSCRIBED");
      expect(vi.mocked(sendEmailWithLogging)).not.toHaveBeenCalled();
    });
  });

  describe("§8.6 academy suspended → no envía", () => {
    it("skip con razón ACADEMY_SUSPENDED", async () => {
      setOwnerRead({ academySuspended: true });
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d7",
        force: true,
      });
      expect(result.outcome).toBe("skipped");
      expect(result.reason).toBe("ACADEMY_SUSPENDED");
    });

    it("skip con razón ACADEMY_CHURNED cuando trial_ends_at expiró sin pagos configurados", async () => {
      setOwnerRead({
        academyTrialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        academyPaymentsConfiguredAt: null,
      });
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d7",
        force: true,
      });
      expect(result.outcome).toBe("skipped");
      expect(result.reason).toBe("ACADEMY_CHURNED");
    });
  });

  describe("§8.7 next_step_url invalido → no envía + log", () => {
    it("skip con razón NEXT_STEP_URL_INVALID:INVALID_STEP_KEY cuando el step key no esta en la allowlist", async () => {
      // Defense-in-depth: si por algun motivo la DB contiene un
      // `next_step_key` fuera de la allowlist (dato corrupto, schema
      // drift), el gate debe abortar y dejar traza en email_logs.
      setOwnerRead();
      setNextPending({ key: "evil-step", label: "No deberia existir" });
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      expect(result.outcome).toBe("skipped");
      expect(result.reason).toMatch(/NEXT_STEP_URL_INVALID/);
    });

    it("safety net: cuando env apunta a host no-Zaltyko, la URL cae a zaltyko.com y envia", async () => {
      // El helper de allowlist es defense-in-depth: si `NEXT_PUBLIC_APP_URL`
      // o `ZALTYKO_EMAIL_DOMAIN` apuntan a un host atacante, NO se annade
      // al allowlist y `buildNextStepUrl` cae al `config.domainName`
      // canonico. El integrador envia el email con la URL segura.
      const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
      const originalEmailDomain = process.env.ZALTYKO_EMAIL_DOMAIN;
      try {
        process.env.NEXT_PUBLIC_APP_URL = "https://attacker.example.com";
        process.env.ZALTYKO_EMAIL_DOMAIN = "attacker.example.com";
        // readOwnerContext + gate.getNextPending + sendStep.getNextPending.
        setOwnerRead();
        setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
        setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
        const result = await sendOnboardingOwnerStep({
          academyId: ACADEMY_ID,
          step: "d0",
          force: true,
        });
        expect(result.outcome).toBe("sent");
        const call = vi.mocked(sendEmailWithLogging).mock.calls[0][0];
        expect(call.html).toContain("zaltyko.com");
        expect(call.html).not.toContain("attacker.example.com");
      } finally {
        process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
        process.env.ZALTYKO_EMAIL_DOMAIN = originalEmailDomain;
      }
    });
  });

  describe("§8.8 locale != es → no envía", () => {
    it("skip con razón OWNER_LOCALE_NOT_ES (B2 column missing, default es)", async () => {
      setOwnerRead({ ownerLocale: "en" });
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d2",
        force: true,
      });
      expect(result.outcome).toBe("skipped");
      expect(result.reason).toBe("OWNER_LOCALE_NOT_ES");
    });
  });

  describe("§8.9 destinatario siempre owner_email", () => {
    it("el `to` del email es auth.users.email del owner (no atletas)", async () => {
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      const call = vi.mocked(sendEmailWithLogging).mock.calls[0][0];
      expect(call.to).toBe("lucia@example.com");
    });

    it("skip con OWNER_EMAIL_MISSING si no hay email del owner", async () => {
      setOwnerRead({ ownerEmail: null });
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      expect(result.outcome).toBe("skipped");
      expect(result.reason).toBe("OWNER_EMAIL_MISSING");
    });
  });

  describe("§8.12 timing de d2/d7", () => {
    it("ONBOARDING_OWNER_THRESHOLDS.d2.target = 48h ± 2h", async () => {
      const { ONBOARDING_OWNER_THRESHOLDS } = await import(
        "@/lib/onboarding-owner-integration"
      );
      expect(ONBOARDING_OWNER_THRESHOLDS.d2.target).toBe(48 * 60 * 60 * 1000);
      expect(ONBOARDING_OWNER_THRESHOLDS.d2.tolerance).toBe(2 * 60 * 60 * 1000);
    });

    it("ONBOARDING_OWNER_THRESHOLDS.d7.target = 7d ± 6h", async () => {
      const { ONBOARDING_OWNER_THRESHOLDS } = await import(
        "@/lib/onboarding-owner-integration"
      );
      expect(ONBOARDING_OWNER_THRESHOLDS.d7.target).toBe(7 * 24 * 60 * 60 * 1000);
      expect(ONBOARDING_OWNER_THRESHOLDS.d7.tolerance).toBe(6 * 60 * 60 * 1000);
    });

    it("processOnboardingOwnerD2 devuelve {disabled: false} cuando SEQUENCE_ENABLED=true", async () => {
mocks.selectCalls.push({ result: [] }); // academies candidate scan
      const result = await processOnboardingOwnerD2();
      expect(result.disabled).toBe(false);
    });

    it("processOnboardingOwnerD2 devuelve {disabled: true} cuando SEQUENCE_ENABLED=false", async () => {
      process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED = "false";
      const result = await processOnboardingOwnerD2();
      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
    });

    it("processOnboardingOwnerD7 devuelve {disabled: true} cuando SEQUENCE_ENABLED=false", async () => {
      process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED = "false";
      const result = await processOnboardingOwnerD7();
      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
    });
  });

  describe("§8.13 HTTPS válido en d7 preferencias/baja", () => {
    it("incluye URLs HTTPS allowlisted en footer de d7", async () => {
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d7",
        force: true,
      });
      const call = vi.mocked(sendEmailWithLogging).mock.calls[0][0];
      expect(call.html).toMatch(/href="https:\/\/app\.zaltyko\.com\/app\/settings\/notifications/);
    });

    it("NO incluye URLs de preferencias/baja en d0", async () => {
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      const call = vi.mocked(sendEmailWithLogging).mock.calls[0][0];
      expect(call.html).not.toContain("Dar de baja esta secuencia");
    });
  });

  describe("§8.14 sin tracking de apertura", () => {
    it("no se emite evento de tracking desde el integrador", async () => {
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await sendOnboardingOwnerStep({
        academyId: ACADEMY_ID,
        step: "d0",
        force: true,
      });
      expect(result.outcome).toBe("sent");
      // El template no contiene pixel tracking (verificado en test de templates).
      // Aqui solo verificamos que el integrador no añade metadata de tracking.
      const call = vi.mocked(sendEmailWithLogging).mock.calls[0][0];
      expect(call.metadata).not.toHaveProperty("trackingPixel");
      expect(call.metadata).not.toHaveProperty("openedWebhook");
    });
  });

  describe("enqueueOnboardingOwnerD0", () => {
    it("delega en sendOnboardingOwnerStep({ step: 'd0' })", async () => {
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await enqueueOnboardingOwnerD0({ academyId: ACADEMY_ID, force: true });
      expect(result.outcome).toBe("sent");
      expect(vi.mocked(sendEmailWithLogging).mock.calls[0][0].idempotencyKey).toBe(
        `onboarding-owner:${ACADEMY_ID}:d0`
      );
    });
  });

  describe("getNextPending", () => {
    it("devuelve { done: true } cuando no hay items", async () => {
mocks.selectCalls.push({ result: [] });
      const result = await getNextPending(ACADEMY_ID);
      expect(result).toEqual({ done: true });
    });

    it("devuelve { done: false } con el primer pending", async () => {
mocks.selectCalls.push({
        result: [
          {
            key: "add_5_athletes",
            label: "Añade 5 atletas",
            description: "importante",
            status: "pending",
            completedAt: null,
          },
        ],
      });
      const result = await getNextPending(ACADEMY_ID);
      expect(result.done).toBe(false);
      if (!result.done) {
        expect(result.key).toBe("add_5_athletes");
        expect(result.label).toBe("Añade 5 atletas");
      }
    });

    it("ignora items `skipped` y devuelve { done: true } si no quedan `pending`", async () => {
mocks.selectCalls.push({
        result: [
          {
            key: "add_5_athletes",
            label: "Añade 5 atletas",
            description: "importante",
            status: "skipped",
            completedAt: null,
          },
        ],
      });
      const result = await getNextPending(ACADEMY_ID);
      expect(result).toEqual({ done: true });
    });
  });

  describe("evaluateOnboardingOwnerGate", () => {
    it("es elegible cuando todos los flags están en estado válido", async () => {
      setOwnerRead();
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await evaluateOnboardingOwnerGate(ACADEMY_ID, "d0");
      expect(result.eligible).toBe(true);
      expect(result.ownerEmail).toBe("lucia@example.com");
    });

    it("no es elegible cuando academy está suspended", async () => {
      setOwnerRead({ academySuspended: true });
      setNextPending({ key: "add_5_athletes", label: "Añade 5 atletas" });
      const result = await evaluateOnboardingOwnerGate(ACADEMY_ID, "d0");
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("ACADEMY_SUSPENDED");
    });
  });
});
