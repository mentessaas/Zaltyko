import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("contratos de activación y navegación de onboarding", () => {
  it("mantiene los CTAs sensibles dentro de la academia activa", () => {
    const checklist = read("src/lib/onboarding-routes.ts");
    const upgradeModal = read("src/components/onboarding/UpgradeConfirmationModal.tsx");
    const academyStep = read("src/components/onboarding/steps/AcademyStep.tsx");

    expect(checklist).toContain("href: (academyId) => `/app/${academyId}/billing`");
    expect(checklist).toContain("href: (academyId) => `/app/${academyId}/announcements`");
    expect(upgradeModal).toContain("`/app/${academyId}/billing`");
    expect(academyStep).toContain("`/app/${existingAcademies[0].id}/billing`");
  });

  it("instrumenta los tres hitos de valor de la academia", () => {
    const classesRoute = read("src/app/api/classes/route.ts");
    const athletesRoute = read("src/app/api/athletes/route.ts");
    const attendanceRoute = read("src/app/api/attendance/route.ts");
    const onboarding = read("src/lib/onboarding.ts");

    expect(classesRoute).toContain('trackEvent("first_class_created"');
    expect(classesRoute).toContain("first_class_created:v1:${body.academyId}");
    expect(athletesRoute).toContain('trackEvent("first_athlete_added"');
    expect(athletesRoute).toContain("first_athlete_added:v1:${body.academyId}");
    expect(attendanceRoute).toContain('trackEvent("first_attendance_recorded"');
    expect(attendanceRoute).toContain("first_attendance_recorded:v1:${sessionRow.academyId}");
    expect(onboarding).toContain('trackEvent("academy_activated"');
    expect(onboarding).toContain("class_athlete_attendance_7d");
  });

  it("no presenta el primer paso como completamente terminado", () => {
    const ownerOnboarding = read("src/components/onboarding/OwnerOnboardingForm.tsx");

    expect(ownerOnboarding).toContain('aria-label="Paso 1 de 5 de la configuración"');
    expect(ownerOnboarding).toContain("Paso 1 de 5 · Crear el espacio de trabajo");
    expect(ownerOnboarding).toContain("w-1/5");
    expect(ownerOnboarding).not.toContain("w-full rounded-full bg-primary");
  });

  it("mantiene la primera pantalla enfocada y deja la configuración avanzada fuera del camino crítico", () => {
    const ownerOnboarding = read("src/components/onboarding/OwnerOnboardingForm.tsx");
    const mainFields = ownerOnboarding.slice(0, ownerOnboarding.indexOf("Configuración avanzada"));

    expect(mainFields).toContain("Nombre completo");
    expect(mainFields).toContain("Nombre de tu academia");
    expect(mainFields).toContain("País base");
    expect(mainFields).toContain("Disciplina principal");
    expect(mainFields).not.toContain("Ramas activas");
    expect(mainFields).not.toContain("Tipo de academia");
  });

  it("mantiene los roles visibles y la CTA alcanzable en el primer viewport móvil", () => {
    const registerForm = read("src/components/RegisterForm.tsx");

    expect(registerForm).toContain('role="radiogroup" aria-label="Tipo de cuenta"');
    expect(registerForm).toContain('className="grid grid-cols-2 gap-2"');
    expect(registerForm).toContain("min-h-[82px]");
    expect(registerForm).toContain("primero crearás tu cuenta personal");
  });
});
