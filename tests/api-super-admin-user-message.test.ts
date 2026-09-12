import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("@/lib/authz", () => ({
  withSuperAdmin: (handler: any) => handler,
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: mocks.createNotification,
}));

vi.mock("@/lib/supabase/admin-operations", () => ({
  getAuthUserEmail: vi.fn(),
}));

vi.mock("@/lib/brevo", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/config", () => ({
  config: {
    brevo: { supportEmail: "support@zaltyko.com" },
  },
}));

vi.mock("@/lib/email/escape-html", () => ({
  escapeHtml: (value: string) => value,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST } from "@/app/api/super-admin/users/[profileId]/send-message/route";

const profile = {
  id: "00000000-0000-0000-0000-000000000123",
  userId: "00000000-0000-0000-0000-000000000456",
  tenantId: "00000000-0000-0000-0000-000000000789",
};

function mockProfileSelect() {
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: vi.fn().mockResolvedValue([profile]),
      }),
    }),
  });
}

describe("API /api/super-admin/users/[profileId]/send-message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileSelect();
  });

  it("crea una notificación interna con el perfil y tenant verificados", async () => {
    mocks.createNotification.mockResolvedValue({ id: "notification-1" });

    const request = new NextRequest(
      "https://zaltyko.com/api/super-admin/users/00000000-0000-0000-0000-000000000123/send-message",
      {
        method: "POST",
        body: JSON.stringify({
          profileId: profile.id,
          subject: "Revisión de cuenta",
          message: "Necesitamos revisar tu configuración.",
          type: "notification",
        }),
      }
    );

    const response = await POST(request, { profile: { role: "super_admin" } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      data: {
        ok: true,
        message: "Notificación enviada correctamente",
      },
    });
    expect(mocks.createNotification).toHaveBeenCalledWith({
      tenantId: profile.tenantId,
      userId: profile.id,
      type: "admin_message",
      title: "Revisión de cuenta",
      message: "Necesitamos revisar tu configuración.",
      data: { source: "super-admin", channel: "notification" },
    });
  });

  it("rechaza el canal interno si el perfil no tiene tenant", async () => {
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue([{ ...profile, tenantId: null }]),
        }),
      }),
    });

    const request = new NextRequest(
      "https://zaltyko.com/api/super-admin/users/00000000-0000-0000-0000-000000000123/send-message",
      {
        method: "POST",
        body: JSON.stringify({
          profileId: profile.id,
          subject: "Revisión de cuenta",
          message: "Necesitamos revisar tu configuración.",
          type: "notification",
        }),
      }
    );

    const response = await POST(request, { profile: { role: "super_admin" } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("USER_TENANT_NOT_FOUND");
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });
});