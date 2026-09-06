import { revalidatePath } from "next/cache";

/** Purga todas las señales públicas derivadas del estado de una academia. */
export function revalidatePublicAcademySeo(academyId: string): void {
  revalidatePath("/sitemap.xml");
  revalidatePath("/academias");
  revalidatePath(`/academias/${academyId}`);
}
