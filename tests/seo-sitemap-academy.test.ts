import { describe, expect, it, vi } from "vitest";

const select = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: { select },
}));

vi.mock("@/db/schema", () => ({
  academies: {
    id: "academies.id",
    createdAt: "academies.created_at",
    statusUpdatedAt: "academies.status_updated_at",
    isPublic: "academies.is_public",
    isSuspended: "academies.is_suspended",
    status: "academies.status",
  },
}));

vi.mock("@/lib/seo/site-url", () => ({
  getPublicSiteUrl: () => "https://zaltyko.com",
}));

import sitemap from "@/app/sitemap";

describe("academy sitemap entries", () => {
  it("includes only public active/trial academies and excludes terminal states", async () => {
    const where = vi.fn().mockResolvedValue([
      {
        id: "academy-public",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        statusUpdatedAt: new Date("2026-08-20T00:00:00.000Z"),
        isPublic: true,
        isSuspended: false,
        status: "active",
      },
      {
        id: "academy-trial",
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
        statusUpdatedAt: null,
        isPublic: true,
        isSuspended: false,
        status: "trial",
      },
      {
        id: "academy-churned",
        createdAt: new Date("2026-08-03T00:00:00.000Z"),
        statusUpdatedAt: null,
        isPublic: true,
        isSuspended: false,
        status: "churned",
      },
      {
        id: "academy-fraud-hold",
        createdAt: new Date("2026-08-04T00:00:00.000Z"),
        statusUpdatedAt: null,
        isPublic: true,
        isSuspended: false,
        status: "fraud_hold",
      },
      {
        id: "academy-suspended",
        createdAt: new Date("2026-08-05T00:00:00.000Z"),
        statusUpdatedAt: null,
        isPublic: true,
        isSuspended: true,
        status: "active",
      },
    ]);
    const from = vi.fn().mockReturnValue({ where });
    select.mockReturnValue({ from });

    const result = await sitemap();

    expect(result).toContainEqual({
      url: "https://zaltyko.com/academias/academy-public",
      lastModified: new Date("2026-08-20T00:00:00.000Z"),
      changeFrequency: "weekly",
      priority: 0.7,
    });
    expect(result).toContainEqual({
      url: "https://zaltyko.com/academias/academy-trial",
      lastModified: new Date("2026-08-02T00:00:00.000Z"),
      changeFrequency: "weekly",
      priority: 0.7,
    });
    expect(result.some((entry) => entry.url.includes("academy-churned"))).toBe(false);
    expect(result.some((entry) => entry.url.includes("academy-fraud-hold"))).toBe(false);
    expect(result.some((entry) => entry.url.includes("academy-suspended"))).toBe(false);
    expect(where).toHaveBeenCalledOnce();
  });
});
