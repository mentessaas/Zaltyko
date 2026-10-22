import { redirect } from "next/navigation";

/**
 * Ruta base de una academia. Antes daba 404 (no existía page.tsx).
 * Redirige al dashboard de la academia.
 */
export default async function AcademyIndexPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  redirect(`/app/${academyId}/dashboard`);
}
