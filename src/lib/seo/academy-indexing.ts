import { revalidatePath } from "next/cache";

export {
  NON_INDEXABLE_ACADEMY_ROBOTS,
  NON_INDEXABLE_ACADEMY_ROBOTS_HEADER,
} from "@/lib/seo/academy-robots";

/** Únicos estados que pueden aparecer en señales SEO públicas. */
export const INDEXABLE_ACADEMY_STATUSES = ["active", "trial"] as const;

export function isAcademyIndexable(input: {
  isPublic: boolean;
  isSuspended: boolean;
  status: string | null | undefined;
}): boolean {
  return (
    input.isPublic &&
    !input.isSuspended &&
    INDEXABLE_ACADEMY_STATUSES.includes(
      input.status as (typeof INDEXABLE_ACADEMY_STATUSES)[number]
    )
  );
}

/**
 * Invalida las señales públicas que dependen de la academia.
 *
 * Se llama después de cualquier mutación que pueda cambiar su visibilidad,
 * estado terminal o contenido público. Search Console verá la exclusión en
 * el siguiente rastreo; esta función no realiza llamadas externas.
 */
export function revalidatePublicAcademySeo(academyId: string): void {
  revalidatePath("/sitemap.xml");
  revalidatePath("/academias");
  revalidatePath(`/academias/${academyId}`);
}
