import { describe, it, expect, vi, beforeEach } from "vitest";

// sendPushToUser() agrega Web Push (VAPID) + Expo Push (nativo iOS/Android).
// Antes de la app móvil, sin subscripciones web devolvía {sent:0,failed:0}
// de forma temprana; ahora debe seguir intentando el canal Expo aunque no
// haya subscripciones web (ver src/lib/notifications/push-service.ts).

const { selectMock, sendExpoPushToUserMock, isExpoPushConfiguredMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  sendExpoPushToUserMock: vi.fn(),
  isExpoPushConfiguredMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: selectMock,
      })),
    })),
  },
}));

vi.mock("@/db/schema/push-subscriptions", () => ({
  pushSubscriptions: { userId: "userId", endpoint: "endpoint" },
}));

vi.mock("@/lib/notifications/expo-push", () => ({
  sendExpoPushToUser: sendExpoPushToUserMock,
  isExpoPushConfigured: isExpoPushConfiguredMock,
}));

import { sendPushToUser } from "@/lib/notifications/push-service";

describe("sendPushToUser - agregado Expo Push (app móvil)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockResolvedValue([]); // sin subscripciones web
  });

  it("envía por Expo aunque el usuario no tenga subscripciones web", async () => {
    isExpoPushConfiguredMock.mockReturnValue(true);
    sendExpoPushToUserMock.mockResolvedValue({ sent: 2, failed: 0 });

    const result = await sendPushToUser("user-1", {
      title: "Nuevo aviso",
      body: "Tienes un mensaje nuevo",
    });

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(sendExpoPushToUserMock).toHaveBeenCalledWith("user-1", {
      title: "Nuevo aviso",
      body: "Tienes un mensaje nuevo",
      data: undefined,
    });
  });

  it("no llama a Expo si EXPO_PUSH_ENABLED=false", async () => {
    isExpoPushConfiguredMock.mockReturnValue(false);

    const result = await sendPushToUser("user-1", {
      title: "t",
      body: "b",
    });

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendExpoPushToUserMock).not.toHaveBeenCalled();
  });

  it("un fallo del backend de Expo no rompe el caller ni cuenta como failed", async () => {
    isExpoPushConfiguredMock.mockReturnValue(true);
    sendExpoPushToUserMock.mockRejectedValue(new Error("Expo API down"));

    const result = await sendPushToUser("user-1", { title: "t", body: "b" });

    expect(result).toEqual({ sent: 0, failed: 0 });
  });
});
