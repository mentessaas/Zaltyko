import { describe, expect, it, vi } from "vitest";

const { mockGetPublicAcademy, mockSelect } = vi.hoisted(() => ({
  mockGetPublicAcademy: vi.fn(),
  mockSelect: vi.fn(),
}));
const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/public/get-public-academy", () => ({
  getPublicAcademy: mockGetPublicAcademy,
}));
vi.mock("@/components/public/AcademyHero", () => ({ AcademyHero: () => null }));
vi.mock("@/components/public/AcademyInfo", () => ({ AcademyInfo: () => null }));
vi.mock("@/components/public/AcademySchedule", () => ({ AcademySchedule: () => null }));
vi.mock("@/components/public/ContactAcademyForm", () => ({ ContactAcademyForm: () => null }));
vi.mock("@/components/public/NearbyAcademies", () => ({ NearbyAcademies: () => null }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mockSelect } }));
vi.mock("@/db/schema", () => ({
  academies: {
    id: "academies.id",
    status: "academies.status",
    isPublic: "academies.is_public",
    isSuspended: "academies.is_suspended",
    statusUpdatedAt: "academies.status_updated_at",
    createdAt: "academies.created_at",
  },
}));
vi.mock("@/lib/seo/site-url", () => ({ getPublicSiteUrl: () => "https://zaltyko.com" }));
vi.mock("@/lib/seo/clusters", () => ({ MODALITIES: {}, COUNTRIES: {} }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

import { generateMetadata } from "@/app/academias/[id]/page";
import sitemap from "@/app/sitemap";
import {
  INDEXABLE_ACADEMY_STATUS_VALUES,
  isAcademyIndexable,
} from "@/lib/seo/academy-indexability";
import {
  ACADEMY_NO_INDEX_ROBOTS,
  getAcademyRobotsMetadata,
} from "@/lib/seo/academy-robots-directives";
import { revalidatePublicAcademySeo } from "@/lib/seo/revalidate-academy";

function buildSelectChain<T>(rows: T[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  Object.defineProperty(chain, "then", {
    value: (resolve: (value: T[]) => unknown) => Promise.resolve(rows).then(resolve),
    configurable: true,
  });
  return chain;
}

describe("SEO de academias fail-closed", () => {
  it("solo permite active/trial públicos sin suspensión", () => {
    expect(INDEXABLE_ACADEMY_STATUS_VALUES).toEqual(["active", "trial"]);
    for (const status of ["active", "trial"]) {
      expect(isAcademyIndexable({ status, isPublic: true, isSuspended: false })).toBe(true);
    }
    for (const status of ["suspended", "churned", "fraud_hold", "unknown", null]) {
      expect(isAcademyIndexable({ status, isPublic: true, isSuspended: false })).toBe(false);
    }
    expect(isAcademyIndexable({ status: "active", isPublic: true, isSuspended: true })).toBe(false);
    expect(isAcademyIndexable({ status: "active", isPublic: true, isSuspended: null })).toBe(false);
    expect(isAcademyIndexable({ status: "active", isPublic: false, isSuspended: false })).toBe(false);
  });

  it("mantiene noindex/noarchive en metadata no indexable", () => {
    expect(getAcademyRobotsMetadata(false)).toEqual({ index: false, follow: true, noarchive: true });
    expect(ACADEMY_NO_INDEX_ROBOTS).toBe("noindex, noarchive");
  });

  it("marca noindex/noarchive si el detalle no es elegible", async () => {
    mockGetPublicAcademy.mockResolvedValueOnce(null);
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "terminal" }) });
    expect(metadata.robots).toEqual({ index: false, follow: true, noarchive: true });
  });

  it("deja indexable solo un detalle público elegible", async () => {
    mockGetPublicAcademy.mockResolvedValueOnce({
      name: "Club Zaltyko",
      publicDescription: "Gimnasia artística",
    });
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "active" }) });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it("incluye solo academias elegibles en el sitemap", async () => {
    mockSelect.mockReturnValue(buildSelectChain([
      { id: "active", status: "active", isPublic: true, isSuspended: false, statusUpdatedAt: null, createdAt: new Date("2026-09-01") },
      { id: "trial", status: "trial", isPublic: true, isSuspended: false, statusUpdatedAt: null, createdAt: new Date("2026-09-01") },
      { id: "churned", status: "churned", isPublic: true, isSuspended: false, statusUpdatedAt: null, createdAt: new Date("2026-09-01") },
      { id: "suspended", status: "active", isPublic: true, isSuspended: true, statusUpdatedAt: null, createdAt: new Date("2026-09-01") },
    ]));
    const urls = await sitemap();
    expect(urls.some((entry) => entry.url.endsWith("/academias/active"))).toBe(true);
    expect(urls.some((entry) => entry.url.endsWith("/academias/trial"))).toBe(true);
    expect(urls.some((entry) => entry.url.includes("churned"))).toBe(false);
    expect(urls.some((entry) => entry.url.includes("suspended"))).toBe(false);
  });

  it("omite academias del sitemap ante un fallo de consulta", async () => {
    const chain = buildSelectChain<never>([]);
    Object.defineProperty(chain, "then", {
      value: (_resolve: unknown, reject: (error: Error) => unknown) =>
        Promise.reject(new Error("DB down")).catch(reject),
      configurable: true,
    });
    mockSelect.mockReturnValue(chain);
    const urls = await sitemap();
    expect(urls.some((entry) => entry.url.includes("/academias/"))).toBe(false);
  });

  it("revalida sitemap, directorio y detalle tras cambios públicos", () => {
    revalidatePublicAcademySeo("academy-1");
    expect(mockRevalidatePath.mock.calls).toEqual([
      ["/sitemap.xml"],
      ["/academias"],
      ["/academias/academy-1"],
    ]);
  });
});
