import { notFound, permanentRedirect } from "next/navigation";
import { flag, entryPath } from "@/lib/directory/contracts";
import { getEntry } from "@/lib/directory/service";
import { DirectoryDetail } from "@/components/directory/DirectoryDetail";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!flag("catalog")) return { robots: { index: false } };
  const entry = await getEntry((await params).id);
  return entry
    ? {
        title: entry.data.name,
        description: entry.data.description,
        alternates: { canonical: `${getPublicSiteUrl()}${entryPath(entry)}` },
      }
    : { robots: { index: false } };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!flag("catalog")) notFound();
  const entry = await getEntry((await params).id);
  if (!entry || entry.kind !== "organization") notFound();
  if (entryPath(entry).split("/").pop() !== (await params).id)
    permanentRedirect(entryPath(entry));
  return <DirectoryDetail entry={entry} />;
}
