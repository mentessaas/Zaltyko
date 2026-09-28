import { notFound } from "next/navigation";

import { EditorPageServer } from "@/components/actor-page-editor/EditorPageServer";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function CoachPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getCurrentUser())) notFound();
  const { id } = await params;
  return <EditorPageServer entityType="coach" entityId={id} />;
}
