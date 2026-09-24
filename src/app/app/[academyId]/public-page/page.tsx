import { EditorPageServer } from "@/components/actor-page-editor/EditorPageServer";

export default function AcademyPublicPage({
  params,
}: {
  params: { academyId: string };
}) {
  return <EditorPageServer entityType="academy" entityId={params.academyId} />;
}
