import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect, mockGetPublicAcademy } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockGetPublicAcademy: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: (...args: unknown[]) => mockSelect(...args) },
}));

vi.mock("@/app/actions/public/get-public-academy", () => ({
  getPublicAcademy: mockGetPublicAcademy,
}));

import { generateMetadata } from "@/app/academias/[id]/page";
import sitemap from "@/app/sitemap";
import { isPublicAcademyIndexable } from "@/../middleware";
import {
  INDEXABLE_ACADEMY_STATUS_VALUES,
  isAcademyIndexable,
} from "@/lib/seo/academy-indexability";
import {
  ACADEMY_NO_INDEX_ROBOTS,
  getAcademyRobotsHeader,
  getAcademyRobotsMetadata,
} from "@/lib/seo/academy-robots";

function buildSelectChain<T>(rows: T[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  Object.defineProperty(chain, "then", {
    value: (resolve: (value: T[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
    configurable: true,
  });
  return chain;
}

describe("academy SEO fail-closed contract", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockGetPublicAcademy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("solo indexa estados activos o trial sin suspensión", () => {
    expect(INDEXABLE_ACADEMY_STATUS_VALUES).toEqual(["active", "trial"]);
    expect(isAcademyIndexable({ status: "active", isSuspended: false })).toBe(
      true
    );
    expect(isAcademyIndexable({ status: "trial", isSuspended: false })).toBe(
      true
    );
  });

  it("excluye status churned", () => {
    expect(isAcademyIndexable({ status: "churned", isSuspended: false })).toBe(
      false
    );
  });

  it("excluye status fraud_hold", () => {
    expect(
      isAcademyIndexable({ status: "fraud_hold", isSuspended: false })
    ).toBe(false);
  });

  it("excluye status suspended", () => {
    expect(
      isAcademyIndexable({ status: "suspended", isSuspended: false })
    ).toBe(false);
  });

  it("excluye status desconocido o nulo", () => {
    expect(isAcademyIndexable({ status: "unknown", isSuspended: false })).toBe(
      false
    );
    expect(isAcademyIndexable({ status: null, isSuspended: false })).toBe(
      false
    );
  });

  it("excluye isSuspended=true", () => {
    expect(isAcademyIndexable({ status: "active", isSuspended: true })).toBe(
      false
    );
  });

  it("excluye isSuspended=null", () => {
    expect(isAcademyIndexable({ status: "active", isSuspended: null })).toBe(
      false
    );
  });

  it("excluye isSuspended ausente", () => {
    expect(isAcademyIndexable({ status: "active" })).toBe(false);
  });

  it("emite noindex/noarchive para detalles no indexables", () => {
    expect(getAcademyRobotsMetadata(false)).toMatchObject({
      index: false,
      follow: true,
      noarchive: true,
    });
    expect(getAcademyRobotsHeader(false)).toBe(ACADEMY_NO_INDEX_ROBOTS);
    expect(getAcademyRobotsHeader(true)).toBeNull();
  });

  it("cabecera condicional falla cerrado si no puede verificar el estado", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    await expect(isPublicAcademyIndexable("academy-id")).resolves.toBe(false);
    expect(getAcademyRobotsHeader(false)).toBe(ACADEMY_NO_INDEX_ROBOTS);
  });

  it("cabecera condicional permite una academia activa verificada", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify([
              { status: "active", is_suspended: false, is_public: true },
            ]),
            { status: 200 }
          )
        )
    );

    await expect(isPublicAcademyIndexable("academy-id")).resolves.toBe(true);
    expect(getAcademyRobotsHeader(true)).toBeNull();
  });

  it("generateMetadata es fail-closed si la academia no está disponible", async () => {
    mockGetPublicAcademy.mockResolvedValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "terminal" }),
    });

    expect(metadata.robots).toMatchObject({
      index: false,
      follow: true,
      noarchive: true,
    });
  });

  it("generateMetadata permite indexar una academia pública elegible", async () => {
    mockGetPublicAcademy.mockResolvedValue({
      name: "Club Zaltyko",
      publicDescription: "Gimnasia artística",
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "active" }),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it("sitemap incluye solo academias públicas elegibles", async () => {
    mockSelect.mockReturnValue(
      buildSelectChain([
        {
          id: "active-id",
          status: "active",
          isSuspended: false,
          isPublic: true,
          lastModified: new Date("2026-09-01T00:00:00.000Z"),
          createdAt: null,
        },
        {
          id: "trial-id",
          status: "trial",
          isSuspended: false,
          isPublic: true,
          lastModified: null,
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
        },
        {
          id: "churned-id",
          status: "churned",
          isSuspended: false,
          isPublic: true,
          lastModified: null,
          createdAt: null,
        },
        {
          id: "suspended-id",
          status: "active",
          isSuspended: true,
          isPublic: true,
          lastModified: null,
          createdAt: null,
        },
      ])
    );

    const urls = await sitemap();

    expect(
      urls.some((entry) => entry.url.endsWith("/academias/active-id"))
    ).toBe(true);
    expect(
      urls.some((entry) => entry.url.endsWith("/academias/trial-id"))
    ).toBe(true);
    expect(urls.some((entry) => entry.url.includes("churned-id"))).toBe(false);
    expect(urls.some((entry) => entry.url.includes("suspended-id"))).toBe(
      false
    );
  });

  it("sitemap no agrega academias si falla la consulta", async () => {
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
});
