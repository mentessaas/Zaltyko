/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { AnnouncementsPanel } from "@/components/communication/panels/AnnouncementsPanel";
import { MessagesPanel } from "@/components/communication/panels/MessagesPanel";
import { NotificationsPanel } from "@/components/communication/panels/NotificationsPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockApi(data: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok,
    json: async () => ok ? { ok: true, data } : { ok: false, message: "Fallo controlado" },
  }));
}

describe("communication center panels", () => {
  it("reads the standardized conversations envelope", async () => {
    mockApi({ items: [{ id: "conversation-1", lastMessagePreview: "Hola familia", lastMessageAt: "2026-07-10T10:00:00.000Z", unreadCount: 1 }] });
    render(<MessagesPanel academyId="academy-1" />);
    expect(await screen.findByText("Hola familia")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/messages/conversations?academyId=academy-1");
  });

  it("reads announcements using the API camelCase fields", async () => {
    mockApi({ items: [{ id: "announcement-1", title: "Cambio de horario", content: "La clase empieza a las 18:00", priority: "normal", publishedAt: "2026-07-10T10:00:00.000Z" }] });
    render(<AnnouncementsPanel academyId="academy-1" />);
    expect(await screen.findByText("Cambio de horario")).toBeInTheDocument();
  });

  it("renders notification API failures instead of a false empty state", async () => {
    mockApi({}, false);
    render(<NotificationsPanel academyId="academy-1" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Fallo controlado"));
  });
});
