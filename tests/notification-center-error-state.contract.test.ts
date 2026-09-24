import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("notification center resilience", () => {
  it("shows a retry state when the notification feed fails", () => {
    const source = readFileSync("src/components/notifications/NotificationCenter.tsx", "utf8");
    expect(source).toContain("loadError");
    expect(source).toContain("No se pudieron cargar las notificaciones");
    expect(source).toContain("onClick={() => loadNotifications(true)}");
  });
});
