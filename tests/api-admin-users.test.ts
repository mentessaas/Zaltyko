import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

let POST: typeof import("@/app/api/admin/users/route").POST;
const sendEmailMock = vi.fn();
const insertValuesMock = vi.fn().mockReturnThis();
const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
const selectMock = vi.fn(() => ({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue([]),
  }),
}));

const originalEnv = { ...process.env };

describe("API /api/admin/users", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv, NEXT_PUBLIC_APP_URL: "http://app.localhost" };

    vi.mock("@/lib/authz", () => ({
      withTenant:
        (handler: (request: Request, context: any) => Promise<Response>) =>
        (request: Request) =>
          handler(request, {
            tenantId: "tenant-123",
            userId: "user-999",
            profile: { id: "profile-1", role: "admin", tenantId: "tenant-123" },
          }),
    }));

    vi.mock("@/lib/mailgun", () => ({
      sendEmail: sendEmailMock.mockResolvedValue(undefined),
    }));

    vi.mock("@/config", () => ({
      config: {
        appName: "GymnaSaaS",
        mailgun: {
          forwardRepliesTo: "soporte@gymna.app",
        },
      },
    }));

    vi.mock("@/db", () => ({
      db: {
        insert: vi.fn(() => ({
          values: insertValuesMock,
          onConflictDoUpdate: onConflictDoUpdateMock,
        })),
        select: selectMock,
      },
    }));

    const adminModule = await import("@/app/api/admin/users/route");
    POST = adminModule.POST;
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("crea una invitación para un coach", async () => {
    const request = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: "coach@example.com",
        role: "coach",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await POST(request, {} as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true });

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    const [payload] = insertValuesMock.mock.calls[0];
    expect(payload).toMatchObject({
      tenantId: "tenant-123",
      email: "coach@example.com",
      role: "coach",
      invitedBy: "user-999",
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "coach@example.com",
        subject: expect.stringContaining("GymnaSaaS"),
      })
    );
  });
});


