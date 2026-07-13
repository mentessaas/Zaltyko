/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionAttendancePanel } from "@/components/coach/SessionAttendancePanel";
import { SessionProgressPanel } from "@/components/coach/SessionProgressPanel";
import type { SessionWorkspaceAthlete } from "@/components/coach/session-workspace-types";

const athletes: SessionWorkspaceAthlete[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ana López",
    groupName: "GAF Base",
    groupColor: "#00796B",
    sportConfigId: "22222222-2222-4222-8222-222222222222",
    disciplineName: "Gimnasia artística",
    branchName: "Artística femenina",
    apparatus: [
      { code: "VT", name: "Salto" },
      { code: "UB", name: "Paralelas asimétricas" },
    ],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Lucía Pérez",
    groupName: "GAF Base",
    groupColor: "#00796B",
    sportConfigId: "22222222-2222-4222-8222-222222222222",
    disciplineName: "Gimnasia artística",
    branchName: "Artística femenina",
    apparatus: [{ code: "VT", name: "Salto" }],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Fase 3 · workspace de clase de hoy", () => {
  it("guarda la asistencia masiva en la sesión sin cambiar de módulo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { ok: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <SessionAttendancePanel
        sessionId="44444444-4444-4444-8444-444444444444"
        athletes={athletes}
        initialAttendance={[]}
        athleteTerm="Gimnasta"
        athletesTerm="Gimnastas"
        attendanceTerm="Asistencia"
        onSaved={onSaved}
      />
    );

    await user.click(screen.getByRole("button", { name: /marcar todas presentes/i }));
    await user.click(screen.getByRole("button", { name: /guardar asistencia/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(2));
    const [, options] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe("/api/attendance");
    expect(JSON.parse(options.body)).toMatchObject({
      sessionId: "44444444-4444-4444-8444-444444444444",
      entries: [
        { athleteId: athletes[0].id, status: "present" },
        { athleteId: athletes[1].id, status: "present" },
      ],
    });
    expect(await screen.findByText(/asistencia guardada para 2 gimnastas/i)).toBeInTheDocument();
  });

  it("registra progreso con sesión, modalidad, aparato y evaluador derivado por API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { id: "assessment-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <SessionProgressPanel
        sessionId="44444444-4444-4444-8444-444444444444"
        sessionDate="2026-07-13"
        athletes={athletes}
        athleteTerm="Gimnasta"
        apparatusTerm="Aparato"
        initialAssessmentCount={0}
        onSaved={onSaved}
      />
    );

    await user.type(screen.getByLabelText("Observación"), "Recepción estable y hombros abiertos.");
    await user.click(screen.getByRole("button", { name: /guardar progreso de ana lópez/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(1));
    const [, options] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe("/api/assessments");
    expect(JSON.parse(options.body)).toMatchObject({
      athleteId: athletes[0].id,
      sessionId: "44444444-4444-4444-8444-444444444444",
      assessmentDate: "2026-07-13",
      assessmentType: "practice",
      apparatus: "VT",
      sportConfigId: athletes[0].sportConfigId,
      overallComment: "Recepción estable y hombros abiertos.",
    });
    expect(await screen.findByText(/progreso guardado para ana lópez en salto/i)).toBeInTheDocument();
  });

  it("mantiene autorización, scoping y trazabilidad en todos los límites", () => {
    const serverPage = readFileSync(
      join(process.cwd(), "src/app/app/[academyId]/coach/today/[sessionId]/page.tsx"),
      "utf8"
    );
    const assessmentApi = readFileSync(
      join(process.cwd(), "src/app/api/assessments/route.ts"),
      "utf8"
    );
    const attendanceApi = readFileSync(
      join(process.cwd(), "src/app/api/attendance/route.ts"),
      "utf8"
    );
    const classAthletes = readFileSync(
      join(process.cwd(), "src/lib/classes/get-class-athletes.ts"),
      "utf8"
    );
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260713150000_link_assessments_to_class_sessions.sql"),
      "utf8"
    );

    expect(serverPage).toContain("verifyCoachClassScope");
    expect(serverPage).toContain("eq(classSessions.tenantId, academy.tenantId)");
    expect(serverPage).toContain("eq(classes.academyId, academyId)");
    expect(serverPage).toContain("eq(athleteAssessments.sessionId, session.id)");
    expect(assessmentApi).toContain("export const POST = withTenant");
    expect(assessmentApi).toContain("verifyAssessmentSessionContext");
    expect(assessmentApi).toContain("sessionId: body.sessionId ?? null");
    expect(assessmentApi).toContain("assessedBy,");
    expect(attendanceApi).toContain("SESSION_REQUIRED_FOR_COACH");
    expect(attendanceApi).toContain("No tienes permiso para consultar la asistencia");
    expect(classAthletes).toContain("groupAthleteMemberships");
    expect(classAthletes).toContain("classRow.groupId");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS session_id uuid");
    expect(migration).toContain("ON DELETE SET NULL");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS athlete_assessments_session_idx");
  });
});
