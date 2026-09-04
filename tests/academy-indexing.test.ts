import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath }));

import {
  isAcademyIndexable,
  NON_INDEXABLE_ACADEMY_ROBOTS,
  NON_INDEXABLE_ACADEMY_ROBOTS_HEADER,
  revalidatePublicAcademySeo,
} from "@/lib/seo/academy-indexing";

describe("academy robots directives", () => {
  it("keeps HTML metadata and HTTP header directives aligned", () => {
    expect(NON_INDEXABLE_ACADEMY_ROBOTS).toEqual({
      index: false,
      follow: false,
      noarchive: true,
    });
    expect(NON_INDEXABLE_ACADEMY_ROBOTS_HEADER).toBe("noindex, noarchive");
  });
});

describe("isAcademyIndexable", () => {
  it("indexes a public active academy", () => {
    expect(isAcademyIndexable({ isPublic: true, isSuspended: false, status: "active" })).toBe(true);
  });

  it("indexes a public trial academy", () => {
    expect(isAcademyIndexable({ isPublic: true, isSuspended: false, status: "trial" })).toBe(true);
  });

  it("excludes a churned academy", () => {
    expect(isAcademyIndexable({ isPublic: true, isSuspended: false, status: "churned" })).toBe(false);
  });

  it("excludes a fraud-hold academy", () => {
    expect(isAcademyIndexable({ isPublic: true, isSuspended: false, status: "fraud_hold" })).toBe(false);
  });

  it("excludes a semantically suspended academy", () => {
    expect(isAcademyIndexable({ isPublic: true, isSuspended: false, status: "suspended" })).toBe(false);
  });

  it("excludes a missing academy status", () => {
    expect(isAcademyIndexable({ isPublic: true, isSuspended: false, status: null })).toBe(false);
  });

  it("excludes an unknown academy status", () => {
    expect(isAcademyIndexable({ isPublic: true, isSuspended: false, status: "future_status" })).toBe(false);
  });

  it("excludes an academy with the legacy suspended flag", () => {
    expect(isAcademyIndexable({ isPublic: true, isSuspended: true, status: "active" })).toBe(false);
  });

  it("excludes a private academy", () => {
    expect(isAcademyIndexable({ isPublic: false, isSuspended: false, status: "active" })).toBe(false);
  });
});

describe("revalidatePublicAcademySeo", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it("purges the sitemap, directory and academy detail", () => {
    revalidatePublicAcademySeo("academy-123");

    expect(revalidatePath.mock.calls).toEqual([
      ["/sitemap.xml"],
      ["/academias"],
      ["/academias/academy-123"],
    ]);
  });
});
