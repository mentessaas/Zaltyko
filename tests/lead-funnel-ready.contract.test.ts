import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contactRoute = readFileSync("src/app/api/contact/route.ts", "utf8");
const contactForm = readFileSync(
  "src/components/contact/ContactForm.tsx",
  "utf8"
);
const privacyPage = readFileSync(
  "src/app/politica-privacidad/page.tsx",
  "utf8"
);
const growthDashboard = readFileSync("src/lib/growth/dashboard.ts", "utf8");
const retentionRoute = readFileSync(
  "src/app/api/cron/lead-retention/route.ts",
  "utf8"
);
const registerForm = readFileSync("src/components/RegisterForm.tsx", "utf8");
const cookieConsent = readFileSync("src/lib/consent/cookie-consent.ts", "utf8");
const posthogProvider = readFileSync("src/components/PostHogProvider.tsx", "utf8");
const googleAdsTracking = readFileSync(
  "src/components/GoogleAdsTracking.tsx",
  "utf8"
);
const rootLayout = readFileSync("src/app/layout.tsx", "utf8");
const publicGrowthClient = readFileSync("src/lib/growth/client.ts", "utf8");
const utmCapture = readFileSync("src/components/growth/UtmCapture.tsx", "utf8");
const googleAdsClient = readFileSync("src/lib/google-ads.ts", "utf8");
const finalCta = readFileSync("src/app/(site)/home/FinalCtaSection.tsx", "utf8");

describe("academy lead funnel readiness contract", () => {
  it("gives a concise privacy notice without describing the request as marketing consent", () => {
    expect(contactForm).toContain("Usaremos tu nombre, email");
    expect(contactForm).toMatch(/no te suscribe a novedades\s+comerciales/);
    expect(contactForm).not.toContain("aceptas nuestra");
    expect(privacyPage).toContain("Elvis Valdes Inerarte");
    expect(privacyPage).toContain("29660 Marbella, Málaga, España");
    expect(privacyPage).toContain(
      "12 meses desde el último contacto significativo"
    );
  });

  it("notifies the operator without copying a prospect's data into the notification email", () => {
    expect(contactRoute).toContain("/super-admin/growth");
    expect(contactRoute).toContain('replyTo: "hola@zaltyko.com"');
    expect(contactRoute).not.toContain("Nombre:</strong>");
    expect(contactRoute).not.toContain("Email:</strong>");
    expect(contactRoute).not.toContain("Mensaje:</strong>");
  });

  it("keeps recent contact details available in the protected growth inbox", () => {
    expect(growthDashboard).toContain("from(leadInteractions)");
    expect(growthDashboard).toContain(".limit(50)");
    expect(
      readFileSync("src/app/(super-admin)/super-admin/growth/page.tsx", "utf8")
    ).toContain("Solicitudes recientes");
  });

  it("does not count an unconfirmed email signup as completed", () => {
    expect(registerForm).toContain("sign_up_confirmation_pending");
    expect(registerForm).not.toContain(
      'trackEvent(directoryRegistration ? "directory_account_registered" : "sign_up_completed", {\n          metadata: {\n            role: directoryRegistration ? "directory" : role,\n            signup_method: "email_password",\n            email_confirmation_pending: true'
    );
  });

  it("protects and bounds the monthly purge of stale unconverted leads", () => {
    expect(retentionRoute).toContain("requireCronAuth(request)");
    expect(retentionRoute).toContain("isNull(leads.tenantId)");
    expect(retentionRoute).toContain("isNull(leads.academyId)");
    expect(retentionRoute).toContain("RETENTION_MONTHS = 12");
    expect(retentionRoute).toContain("BATCH_LIMIT = 250");
    expect(retentionRoute).toContain("leadTrialOutcomes");
  });

  it("loads optional browser analytics only after the matching cookie preference", () => {
    expect(cookieConsent).toContain("zaltyko.cookie-consent.v1");
    expect(posthogProvider).toContain("readCookieConsent()?.analytics");
    expect(googleAdsTracking).toContain("!consent?.marketing");
    expect(rootLayout).toContain("<ConsentAwareVercelTelemetry />");
    expect(rootLayout).toContain("<CookieConsentManager />");
    expect(privacyPage).toContain('id: "cookies"');
    expect(privacyPage).toContain(
      "no se cargan hasta que autorizas cada categoría"
    );
    expect(publicGrowthClient).toContain("if (!readCookieConsent()?.analytics) return;");
    expect(publicGrowthClient).toContain("if (!readCookieConsent()?.analytics)");
    expect(utmCapture).toContain("readCookieConsent()?.analytics");
    expect(googleAdsClient).toContain("readCookieConsent()?.marketing");
    expect(finalCta).not.toContain("EmailCapture");
  });
});
