import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POST,
  GET,
} from "@/app/api/v1/owner/sessions/[sessionId]/attendance/route";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { recordAttendance } from "@/modules/attendance/application/attendance-service";
import {
  loadOwnerSessionAttendanceRoster,
  resolveSessionAttendanceAccess,
} from "@/modules/attendance/application/owner-session-attendance";
import { OperationalError } from "@/modules/shared/domain/operational-error";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({ limit: 30, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "verified-tenant"),
  rateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock("@/modules/attendance/application/attendance-service", () => ({
  recordAttendance: vi.fn(),
}));
vi.mock("@/modules/attendance/application/owner-session-attendance", () => ({
  loadOwnerSessionAttendanceRoster: vi.fn(),
  resolveSessionAttendanceAccess: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const sessionId = "10000000-0000-4000-8000-000000000005";
const enrollmentId = "10000000-0000-4000-8000-000000000006";
const attendanceId = "10000000-0000-4000-8000-000000000007";
const access = {
  memberId,
  role: "owner" as const,
  organizationId,
  locationId,
  sessionId,
  session: {
    locationId,
    classTemplateId: "10000000-0000-4000-8000-000000000009",
    startsAt: new Date("2026-10-13T10:00:00.000Z"),
    timezone: "Europe/Madrid",
  },
};

const routeContext = { params: Promise.resolve({ sessionId }) };
const queryUrl = `https://zaltyko.test/api/v1/owner/sessions/${sessionId}/attendance?organizationId=${organizationId}&locationId=${locationId}`;
const body = { organizationId, locationId, enrollmentId, status: "present" };

function postRequest(payload: unknown = body, key = "attendance-command-001") {
  return new Request(
    `https://zaltyko.test/api/v1/owner/sessions/${sessionId}/attendance`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(payload),
    }
  );
}

describe("API Owner de asistencia de sesión greenfield", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
    vi.mocked(resolveSessionAttendanceAccess).mockResolvedValue(access);
    vi.mocked(loadOwnerSessionAttendanceRoster).mockResolvedValue([
      {
        enrollmentId,
        athleteName: "Gimnasta Sintética",
        attendanceStatus: null,
      },
    ]);
    vi.mocked(recordAttendance).mockResolvedValue({
      id: attendanceId,
      organizationId,
      locationId,
      sessionId,
      enrollmentId,
      athleteId: "10000000-0000-4000-8000-000000000008",
      status: "present",
      recordedByMemberId: memberId,
      recordedAt: new Date("2026-10-13T10:00:00.000Z"),
    } as never);
    vi.mocked(rateLimit).mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: 1_800_000_000,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("lee la lista vigente y el estado previo con respuesta privada", async () => {
    const response = await GET(new Request(queryUrl), routeContext);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.data.items).toEqual([
      {
        enrollmentId,
        athleteName: "Gimnasta Sintética",
        attendanceStatus: null,
      },
    ]);
    expect(loadOwnerSessionAttendanceRoster).toHaveBeenCalledWith(
      {
        organizationId,
        locationId,
        sessionId,
      },
      access
    );
  });

  it("requiere autenticación antes de consultar datos", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET(new Request(queryUrl), routeContext);

    expect(response.status).toBe(401);
    expect(resolveSessionAttendanceAccess).not.toHaveBeenCalled();
    expect(loadOwnerSessionAttendanceRoster).not.toHaveBeenCalled();
  });

  it("deriva el actor autenticado y delega el comando idempotente", async () => {
    const response = await POST(postRequest(), routeContext);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.data).toMatchObject({
      id: attendanceId,
      sessionId,
      enrollmentId,
      status: "present",
    });
    expect(recordAttendance).toHaveBeenCalledWith({
      organizationId,
      expectedLocationId: locationId,
      sessionId,
      enrollmentId,
      status: "present",
      idempotencyKey: "attendance-command-001",
      actor: { userId, memberId },
    });
    expect(resolveSessionAttendanceAccess).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
      sessionId,
    });
  });

  it("rechaza actor o athleteId enviados por el cliente", async () => {
    const response = await POST(
      postRequest({
        ...body,
        actor: { userId, memberId },
        athleteId: enrollmentId,
      }),
      routeContext
    );

    expect(response.status).toBe(400);
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it.each([
    ["sesión de otra organización o sede", "NOT_FOUND", 404],
    ["miembro sin rol autorizado", "FORBIDDEN", 403],
    ["miembro sin acceso a la sede", "LOCATION_SCOPE_DENIED", 403],
    ["coach no asignado", "FORBIDDEN", 403],
  ])("detiene la escritura ante %s", async (_label, code, status) => {
    vi.mocked(resolveSessionAttendanceAccess).mockRejectedValue(
      new OperationalError(
        code as "NOT_FOUND" | "FORBIDDEN" | "LOCATION_SCOPE_DENIED",
        "Acceso denegado",
        status as 403 | 404
      )
    );

    const response = await POST(postRequest(), routeContext);

    expect(response.status).toBe(status);
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it("exige Idempotency-Key", async () => {
    const request = postRequest();
    request.headers.delete("idempotency-key");
    const response = await POST(request, routeContext);

    expect(response.status).toBe(400);
    expect(recordAttendance).not.toHaveBeenCalled();
  });
});
