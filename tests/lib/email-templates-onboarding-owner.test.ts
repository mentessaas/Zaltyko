import { describe, expect, it } from "vitest";

import {
  OnboardingOwnerTemplate,
  getOnboardingOwnerPreheader,
  getOnboardingOwnerSubject,
} from "@/lib/email/templates/onboarding-owner";

describe("onboarding-owner template — §2/§5/§8.10", () => {
  const baseProps = {
    ownerFirstName: "Lucía",
    academyName: "Club Atlético",
    nextStepLabel: "Añade al menos 5 atletas",
    nextStepUrl: "https://app.zaltyko.com/app/onboarding/add_5_athletes?academy=abc",
  };

  describe("subjects (≤60 chars, §2)", () => {
    it("d0 subject = 'Tu academia en Zaltyko ya está lista'", () => {
      expect(getOnboardingOwnerSubject("d0")).toBe(
        "Tu academia en Zaltyko ya está lista"
      );
    });

    it("d2 subject = 'Siguiente paso para configurar tu academia'", () => {
      expect(getOnboardingOwnerSubject("d2")).toBe(
        "Siguiente paso para configurar tu academia"
      );
    });

    it("d7 subject = 'Último recordatorio de tu configuración'", () => {
      expect(getOnboardingOwnerSubject("d7")).toBe(
        "Último recordatorio de tu configuración"
      );
    });

    it.each(["d0", "d2", "d7"] as const)(
      "el subject de %s tiene longitud ≤ 60",
      (step) => {
        expect(getOnboardingOwnerSubject(step).length).toBeLessThanOrEqual(60);
      }
    );
  });

  describe("preheaders (≤90 chars, §5)", () => {
    it.each(["d0", "d2", "d7"] as const)(
      "el preheader de %s tiene longitud ≤ 90",
      (step) => {
        expect(getOnboardingOwnerPreheader(step).length).toBeLessThanOrEqual(90);
      }
    );
  });

  describe("escape HTML — §8.10", () => {
    it("escapa academy_name con <>&'\\\"", () => {
      const html = OnboardingOwnerTemplate({
        ...baseProps,
        step: "d0",
        academyName: `<Club & Atletismo "x">`,
        nextStepUrl: null,
      });
      expect(html).toContain(
        "&lt;Club &amp; Atletismo &quot;x&quot;&gt;"
      );
      // Aseguramos que NO contiene el string crudo de academyName fuera del
      // bloque escapado: en concreto, no debe haber una etiqueta HTML
      // abierta con `Club` literal.
      expect(html).not.toMatch(/<Club /);
    });

    it("escapa owner_first_name con caracteres de control HTML", () => {
      const html = OnboardingOwnerTemplate({
        ...baseProps,
        step: "d0",
        ownerFirstName: `<Mi nombre>`,
        nextStepUrl: null,
      });
      expect(html).toContain("&lt;Mi nombre&gt;");
    });

    it("escapa next_step_label con caracteres de control HTML", () => {
      const html = OnboardingOwnerTemplate({
        ...baseProps,
        step: "d0",
        nextStepLabel: `Paso & "siguiente"`,
        nextStepUrl: "https://app.zaltyko.com/app/onboarding/add_5_athletes?academy=abc",
      });
      expect(html).toContain("Paso &amp; &quot;siguiente&quot;");
    });

    it("NO contiene academy_name literal dentro de un atributo HTML (defensa en profundidad)", () => {
      const academyName = `"onload="alert(1)`;
      const html = OnboardingOwnerTemplate({
        ...baseProps,
        step: "d0",
        academyName,
        nextStepUrl: null,
      });
      // El string peligroso como atributo debe estar escapado.
      expect(html).not.toMatch(/onload=alert/i);
    });
  });

  describe("CTA y bloque 'done'", () => {
    it("incluye el CTA cuando hay nextStepUrl", () => {
      const html = OnboardingOwnerTemplate({ ...baseProps, step: "d0" });
      expect(html).toContain(baseProps.nextStepUrl!);
      expect(html).toContain("Continuar");
    });

    it("muestra bloque de 'Has completado todos los pasos' cuando no hay nextStepUrl", () => {
      const html = OnboardingOwnerTemplate({
        ...baseProps,
        step: "d0",
        nextStepUrl: null,
      });
      expect(html).not.toContain(baseProps.nextStepUrl!);
      expect(html).toContain("Has completado todos los pasos");
    });

    it("incluye preferencias y baja SOLO en d7", () => {
      const htmlD0 = OnboardingOwnerTemplate({ ...baseProps, step: "d0" });
      expect(htmlD0).not.toContain("Preferencias de notificación");
      expect(htmlD0).not.toContain("Dar de baja esta secuencia");

      const htmlD7 = OnboardingOwnerTemplate({
        ...baseProps,
        step: "d7",
        preferencesUrl: "https://app.zaltyko.com/app/settings/notifications",
        unsubscribeUrl:
          "https://app.zaltyko.com/app/settings/notifications?academy=abc&unsub=onboarding-owner",
      });
      expect(htmlD7).toContain("Preferencias de notificación");
      expect(htmlD7).toContain("Dar de baja esta secuencia");
    });
  });

  describe("sin tracking de apertura — §8.14", () => {
    it.each(["d0", "d2", "d7"] as const)(
      "el template %s no contiene un pixel de tracking (img 1x1)",
      (step) => {
        const html = OnboardingOwnerTemplate({ ...baseProps, step });
        // No debe haber un <img> de 1x1 sin alt.
        expect(html).not.toMatch(/<img[^>]*width\s*=\s*["']?1["']?/i);
        expect(html).not.toMatch(/<img[^>]*height\s*=\s*["']?1["']?/i);
      }
    );
  });
});
