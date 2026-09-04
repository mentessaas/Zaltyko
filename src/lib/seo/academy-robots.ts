/** Directivas compartidas por metadata HTML y cabeceras HTTP. */
export const NON_INDEXABLE_ACADEMY_ROBOTS = {
  index: false,
  follow: false,
  noarchive: true,
} as const;

export const NON_INDEXABLE_ACADEMY_ROBOTS_HEADER = "noindex, noarchive";
