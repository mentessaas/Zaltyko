import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  createNotification: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { update: mocks.update },
}));
vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: mocks.createNotification,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));
vi.mock("@/lib/brevo", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/growth/events", () => ({ recordGrowthEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import {
  notifyTrialOwner,
  releaseTrialNotificationClaim,
} from "@/lib/billing/trial-service";

describe("trial lifecycle delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserById.mockResolvedValue({ data: { user: { email: undefined } } });
  });

  it("usa el ID interno del perfil para la notificación", async () => {
    mocks.createNotification.mockResolvedValue({ id: "notification-1" });

    await notifyTrialOwner({
      academyId: "academy-1",
      tenantId: "tenant-1",
      ownerProfileId: "profile-1",
      ownerAuthUserId: "auth-user-1",
      academyName: "Academia Uno",
      kind: "day_five",
    });

    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "profile-1", tenantId: "tenant-1" })
    );
    expect(mocks.getUserById).toHaveBeenCalledWith("auth-user-1");
  });

  it("libera únicamente la marca reclamada para permitir el reintento", async () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const set = vi.fn(() => ({ where: () => Promise.resolve() }));
    mocks.update.mockReturnValue({ set });

    await releaseTrialNotificationClaim("trial-1", "day_five", now);

    expect(set).toHaveBeenCalledWith({ dayFiveNotifiedAt: null, updatedAt: now });
  });
});
