import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: null as { id: string; userId: string; name: string | null; phone: string | null } | null,
  select: vi.fn(),
  getPreference: vi.fn(),
  createNotification: vi.fn(),
  sendPush: vi.fn(),
  isPushConfigured: vi.fn(),
}));

function queryChain(result: unknown[] = []) {
  const query: Record<string, any> = {};
  for (const method of ["from", "where", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  Object.defineProperty(query, "then", {
    value: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return query;
}

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));
vi.mock("@/lib/communication-service", () => ({
  getNotificationPreferenceByChannel: mocks.getPreference,
  getNotificationPreferences: vi.fn(),
}));
vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: mocks.createNotification,
}));
vi.mock("@/lib/notifications/push-service", () => ({
  sendPushToUser: mocks.sendPush,
  isPushConfigured: mocks.isPushConfigured,
}));
vi.mock("@/lib/notifications/whatsapp-service", () => ({
  sendWhatsAppWithTemplate: vi.fn(),
}));
vi.mock("@/lib/brevo", () => ({ sendEmail: vi.fn() }));

import { dispatch } from "@/lib/notifications/dispatcher";

describe("notification dispatcher tenant scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockImplementation(() => queryChain(mocks.profile ? [mocks.profile] : []));
    mocks.getPreference.mockResolvedValue(undefined);
    mocks.createNotification.mockResolvedValue({ id: "notification-1" });
    mocks.sendPush.mockResolvedValue({ sent: 1, failed: 0 });
    mocks.isPushConfigured.mockReturnValue(true);
  });

  it("no entrega ni crea fallback para un perfil fuera del tenant", async () => {
    mocks.profile = null;

    const result = await dispatch({
      tenantId: "tenant-a",
      userId: "profile-other-tenant",
      type: "system",
      title: "Aviso",
      body: "No debe salir",
    });

    expect(result.success).toBe(false);
    expect(result.errors.in_app).toBe("Profile not found for tenant");
    expect(mocks.sendPush).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("usa el Auth UUID solo para push tras resolver el perfil del tenant", async () => {
    mocks.profile = { id: "profile-a", userId: "auth-a", name: "Elvis", phone: null };

    const result = await dispatch({
      tenantId: "tenant-a",
      userId: "profile-a",
      type: "system",
      title: "Aviso",
      body: "Entrega válida",
      channels: ["push"],
    });

    expect(result.success).toBe(true);
    expect(mocks.sendPush).toHaveBeenCalledWith("auth-a", expect.objectContaining({ title: "Aviso" }));
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "profile-a", tenantId: "tenant-a" })
    );
  });
});
