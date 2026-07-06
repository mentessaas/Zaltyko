import { redirect } from "next/navigation";

export default async function AcademyBasePage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  redirect(`/app/${academyId}/dashboard`);
}
