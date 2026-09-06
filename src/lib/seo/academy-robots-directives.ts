import type { Metadata } from "next";

export const ACADEMY_NO_INDEX_ROBOTS = "noindex, noarchive";

export const ACADEMY_NON_INDEXABLE_METADATA: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
  noarchive: true,
};

export function getAcademyRobotsMetadata(indexable: boolean): Metadata["robots"] {
  return indexable ? { index: true, follow: true } : ACADEMY_NON_INDEXABLE_METADATA;
}

export function getAcademyRobotsHeader(indexable: boolean): string | null {
  return indexable ? null : ACADEMY_NO_INDEX_ROBOTS;
}
