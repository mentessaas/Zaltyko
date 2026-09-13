import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

/** Purga todas las señales públicas derivadas del estado de una academia. */
export function revalidatePublicAcademySeo(academyId: string): void {
  for (const path of ["/sitemap.xml", "/academias", `/academias/${academyId}`]) {
    try {
      revalidatePath(path);
    } catch (error) {
      // Cache invalidation is best effort: never report a committed mutation
      // as failed just because one derived page could not be purged.
      logger.error("Failed to revalidate public academy path", error, { academyId, path });
    }
  }
}
