import { EditorPageServer } from "@/components/actor-page-editor/EditorPageServer";

export default async function AcademyPublicPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  return <EditorPageServer entityType="academy" entityId={academyId} />;
}
