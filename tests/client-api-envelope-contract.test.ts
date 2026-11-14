import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("client API envelope contract", () => {
  it("unwraps standardized API responses in profile and academy surfaces", () => {
    expect(source("components/academies/AcademyEditSection.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/profiles/ProfileTabs.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/profiles/OptimizedOwnerProfile.tsx")).toContain("payload?.data ?? payload");
  });

  it("unwraps group and gymnastics dashboard summaries", () => {
    expect(source("components/groups/GroupView.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/dashboard/GymMetricsWidgetLoader.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/groups/GroupsDashboard.tsx")).toContain("payload?.data ?? payload");
  });

  it("unwraps activity, notifications and event collections", () => {
    expect(source("components/athletes/AthleteHistoryView.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/athletes/AthleteClassesSection.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/audit/AuditLogsViewer.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/notifications/NotificationBell.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/events/EventRegistrationsPanel.tsx")).toContain("payload?.data ?? payload");
  });

  it("keeps billing, communication and role onboarding clients compatible with envelopes", () => {
    expect(source("app/billing/page.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/billing/DiscountManager.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/billing/CampaignManager.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/billing/ReceiptViewer.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/billing/CreateChargeDialog.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/billing/GenerateChargesDialog.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/athletes/AthleteAccountSection.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/messages/ContactMessagesList.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/coaches/CoachNotesManager.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/coaches/NoteForm.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/whatsapp/WhatsAppSender.tsx")).toContain("payload?.data ?? payload");
    expect(source("app/(site)/onboarding/athlete/page.tsx")).toContain("payload?.data ?? payload");
    expect(source("app/(site)/onboarding/coach/page.tsx")).toContain("payload?.data ?? payload");
    expect(source("app/app/[academyId]/events/[eventId]/invitations/page.tsx")).toContain("payload?.data ?? payload");
    expect(source("app/app/[academyId]/my-events/page.tsx")).toContain("payload?.data ?? payload");
  });

  it("unwraps skills, guardians and event registration responses", () => {
    expect(source("components/assessments/AssessmentForm.tsx")).toContain("payload?.data ?? payload");
    expect(source("components/athletes/guardians/GuardiansPage.tsx")).toContain("payload?.data ?? payload");
    expect(source("app/app/[academyId]/events/[eventId]/register/page.tsx")).toContain("payload?.data ?? payload");
  });

  it("keeps the legacy enrollment manager on the canonical class APIs", () => {
    const enrollmentManager = source("components/classes/EnrollmentManager.tsx");
    expect(enrollmentManager).toContain("/api/classes/${classId}/athletes");
    expect(enrollmentManager).toContain('"x-academy-id": academyId');
    expect(enrollmentManager).toContain("academyId,");
    expect(enrollmentManager).toContain("payload?.data ?? payload");
  });
});
