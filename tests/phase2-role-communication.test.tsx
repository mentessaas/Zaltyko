/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import TodayQuickActions from "@/components/coach/TodayQuickActions";
import { ContextGroupAlertComposer } from "@/components/messages/ContextGroupAlertComposer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Phase 2 role and internal communication contracts", () => {
  it("keeps the family portal tenant-scoped and free of admin destinations", () => {
    const serverPage = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/my-dashboard/page.tsx"),
      "utf8"
    );
    const clientPage = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/my-dashboard/MyDashboardPage.tsx"),
      "utf8"
    );

    expect(serverPage).toContain("eq(athletes.tenantId, academy.tenantId)");
    expect(serverPage).toContain("eq(athletes.academyId, academyId)");
    expect(serverPage).toContain("eq(charges.tenantId, academy.tenantId)");
    expect(serverPage).toContain("canAccessFamilyFinancialData(profile.role) && targetAthleteId");
    expect(serverPage).toContain("eq(athleteAssessments.academyId, academyId)");
    expect(clientPage).not.toContain("`/app/${academyId}/billing`");
    expect(clientPage).not.toContain("`/app/${academyId}/attendance`");
    expect(clientPage).not.toContain("`/app/${academyId}/assessments`");
    expect(clientPage).not.toContain("wa.me");
    expect(clientPage).toContain("const canViewPayments = isParent");
    expect(clientPage).toContain("Próximas clases");
    expect(clientPage).toContain("attendanceRate === null");
  });

  it("exposes the three coach actions from today's class", () => {
    render(
      <TodayQuickActions
        academyId="11111111-1111-4111-8111-111111111111"
        todaySession={{
          id: "22222222-2222-4222-8222-222222222222",
          classId: "33333333-3333-4333-8333-333333333333",
          className: "Base artística",
          startTime: "18:00",
          groupName: "GAF Base",
          athleteCount: 12,
        }}
      />
    );

    expect(screen.getByRole("link", { name: /pasar asistencia/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/coach/today/22222222-2222-4222-8222-222222222222#attendance")
    );
    expect(screen.getByRole("link", { name: /evaluar progreso/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/coach/today/22222222-2222-4222-8222-222222222222#progress")
    );
    expect(screen.getByRole("link", { name: /aviso al grupo/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/coach/today/22222222-2222-4222-8222-222222222222#alert")
    );
  });

  it("sends a contextual group alert and opens its conversation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: { conversationId: "conversation-1", recipientCount: 2 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSent = vi.fn();
    const user = userEvent.setup();

    render(
      <ContextGroupAlertComposer
        academyId="11111111-1111-4111-8111-111111111111"
        session={{
          id: "22222222-2222-4222-8222-222222222222",
          className: "Base artística",
          groupName: "GAF Base",
          sessionDate: "2026-07-13",
        }}
        onSent={onSent}
      />
    );

    await user.type(screen.getByLabelText("Contenido del aviso al grupo"), "Terminamos a las 19:40.");
    await user.click(screen.getByRole("button", { name: "Enviar aviso interno" }));

    await waitFor(() => expect(onSent).toHaveBeenCalledWith("conversation-1"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messages/group-alert?academyId=11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ method: "POST" })
    );
    expect(await screen.findByText(/aviso enviado a 2 cuentas vinculadas/i)).toBeInTheDocument();
  });

  it("uses current profile columns and implements readable notification preferences", () => {
    const conversationList = readFileSync(
      join(process.cwd(), "src/app/api/messages/conversations/route.ts"),
      "utf8"
    );
    const conversationDetail = readFileSync(
      join(process.cwd(), "src/app/api/messages/conversations/[id]/route.ts"),
      "utf8"
    );
    const preferencesRoute = readFileSync(
      join(process.cwd(), "src/app/api/notifications/preferences/route.ts"),
      "utf8"
    );
    const groupAlertRoute = readFileSync(
      join(process.cwd(), "src/app/api/messages/group-alert/route.ts"),
      "utf8"
    );

    expect(conversationList).toContain("fullName: profiles.name");
    expect(conversationList).toContain("avatarUrl: profiles.photoUrl");
    expect(conversationDetail).toContain("fullName: profiles.name");
    expect(conversationDetail).not.toContain("full_name");
    expect(preferencesRoute).toContain("export const GET = withTenant");
    expect(preferencesRoute).toContain("inAppNotifications");
    expect(groupAlertRoute).toContain("const groupAlertHandler = withTenant");
    expect(groupAlertRoute).toContain("verifyCoachClassScope");
    expect(groupAlertRoute).toContain("export const POST = withRateLimit");
    expect(groupAlertRoute).toContain("notInArray(conversationParticipants.userId");
    expect(groupAlertRoute).toContain("authUserIdByProfileId");
    expect(groupAlertRoute).toContain("pg_advisory_xact_lock");
  });
});
