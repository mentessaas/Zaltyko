import { notFound } from "next/navigation";

import { EditorPageServer } from "@/components/actor-page-editor/EditorPageServer";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AthletePublicPage({
  params,
}: {
  params: { id: string };
}) {
  if (!(await getCurrentUser())) notFound();
  return <EditorPageServer entityType="athlete" entityId={params.id} />;
}
