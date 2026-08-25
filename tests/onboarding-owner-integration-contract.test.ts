import { readFileSync } from "node:fs";
import { describe, expect, it, afterEach } from "vitest";

import {
  buildHttpsUrlInAllowlist,
  buildNextStepUrl,
} from "@/lib/email/allowlist";
import {
  OnboardingOwnerTemplate,
  getOnboardingOwnerCopy,
} from "@/lib/email/templates/onboarding-owner";
import {
  resolveOnboardingOwnerNextStepUrl,
  type NextPendingResult,
} from "@/lib/onboarding-owner-integration";
import { CHECKLIST_KEYS } from "@/lib/onboarding-utils";

const ACADEMY_ID = "11111111-1111-4111-8111-111111111111";

describe("ZAL-908 — contrato d0/d2/d7 integrado", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("resuelve todos los pasos a rutas modernas HTTPS allowlisted", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://sandbox.zaltyko.com";

    for (const key of CHECKLIST_KEYS) {
      const result = buildNextStepUrl({ stepKey: key, academyId: ACADEMY_ID });
      expect(result.ok).toBe(true);
      const url = new URL(result.url!);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("sandbox.zaltyko.com");
      expect(url.pathname).toContain(`/app/${ACADEMY_ID}`);
    }
  });

  it("rechaza UUID inválido, clave desconocida, HTTP y host externo", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://sandbox.zaltyko.com";
    expect(
      buildNextStepUrl({ stepKey: "add_5_athletes", academyId: "not-an-id" }).ok
    ).toBe(false);
    expect(
      buildNextStepUrl({ stepKey: "evil", academyId: ACADEMY_ID }).ok
    ).toBe(false);
    process.env.NEXT_PUBLIC_APP_URL = "http://sandbox.zaltyko.com";
    expect(
      buildNextStepUrl({ stepKey: "add_5_athletes", academyId: ACADEMY_ID }).ok
    ).toBe(false);
    process.env.NEXT_PUBLIC_APP_URL = "https://evil.example.com";
    expect(buildHttpsUrlInAllowlist("/preferences")).toBeNull();
  });

  it("aplica locale fallback y escapa variables en todas las ventanas", () => {
    const english = getOnboardingOwnerCopy("d2", "en");
    const fallback = getOnboardingOwnerCopy("d2", "pt-BR");
    expect(english.subject).toBe("The next step for your academy");
    expect(fallback.subject).toBe("Siguiente paso para configurar tu academia");

    const html = OnboardingOwnerTemplate({
      step: "d7",
      locale: "en",
      ownerFirstName: "<Owner>",
      academyName: "A & B",
      nextStepLabel: "<next>",
      nextStepUrl: "https://sandbox.zaltyko.com/app/example",
      preferencesUrl: "https://sandbox.zaltyko.com/preferences?token=abc",
      unsubscribeUrl: "https://sandbox.zaltyko.com/unsubscribe?token=abc",
    });
    expect(html).toContain("Final setup reminder");
    expect(html).toContain("&lt;Owner&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("Notification preferences");
    expect(html).toContain("Unsubscribe from this sequence");
  });

  it("conecta academy_created, conserva el gate semántico y protege el cron", () => {
    const ownerRoute = readFileSync(
      "src/app/api/onboarding/owner/route.ts",
      "utf8"
    );
    const integration = readFileSync(
      "src/lib/onboarding-owner-integration.ts",
      "utf8"
    );
    const cron = readFileSync(
      "src/app/api/cron/onboarding-owner/route.ts",
      "utf8"
    );
    expect(ownerRoute).toContain("enqueueOnboardingOwnerD0");
    expect(integration).toContain("isAcademyBlockedFromSending");
    expect(integration).not.toContain("update(academies)");
    expect(integration).toContain("resolveOnboardingOwnerNextStepUrl");
    expect(cron).toContain("requireCronAuth");
    expect(cron).toContain("runCronWithLease");
  });

  it("permite que el cierre de la secuencia no fuerce CTA cuando ya no hay siguiente paso", () => {
    const done: NextPendingResult = { done: true };
    const result = resolveOnboardingOwnerNextStepUrl(done, ACADEMY_ID);
    expect(result.ok).toBe(true);
    expect(result.url).toBeNull();
  });
});
