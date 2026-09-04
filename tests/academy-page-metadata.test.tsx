import { describe, expect, it, vi } from "vitest";

const getPublicAcademy = vi.hoisted(() => vi.fn());
const getPublicAcademyIndexingStatus = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/public/get-public-academy", () => ({
  getPublicAcademy,
  getPublicAcademyIndexingStatus,
}));
vi.mock("@/components/public/AcademyHero", () => ({ AcademyHero: () => null }));
vi.mock("@/components/public/AcademyInfo", () => ({ AcademyInfo: () => null }));
vi.mock("@/components/public/AcademySchedule", () => ({ AcademySchedule: () => null }));
vi.mock("@/components/public/ContactAcademyForm", () => ({ ContactAcademyForm: () => null }));
vi.mock("@/components/public/NearbyAcademies", () => ({ NearbyAcademies: () => null }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import { generateMetadata } from "@/app/academias/[id]/page";

describe("academy detail metadata", () => {
  it("adds noindex and noarchive for a terminal academy", async () => {
    getPublicAcademy.mockResolvedValue({ name: "Academia demo", publicDescription: null });
    getPublicAcademyIndexingStatus.mockResolvedValue("noindex");

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "academy-1" }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false, noarchive: true });
  });

  it("adds noindex and noarchive when the academy is not found", async () => {
    getPublicAcademy.mockResolvedValue(null);
    getPublicAcademyIndexingStatus.mockResolvedValue("not_found");

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "academy-1" }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false, noarchive: true });
  });

  it("leaves active public academy metadata indexable", async () => {
    getPublicAcademy.mockResolvedValue({ name: "Academia demo", publicDescription: "Clases" });
    getPublicAcademyIndexingStatus.mockResolvedValue("index");

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "academy-1" }),
    });

    expect(metadata.robots).toBeUndefined();
  });

  it("fails closed when the indexing status lookup rejects", async () => {
    getPublicAcademy.mockResolvedValue({ name: "Academia demo", publicDescription: "Clases" });
    getPublicAcademyIndexingStatus.mockRejectedValue(new Error("status unavailable"));

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "academy-1" }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false, noarchive: true });
  });
});
