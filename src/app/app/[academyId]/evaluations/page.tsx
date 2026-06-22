import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EvaluationsRedirectPage({ params, searchParams }: PageProps) {
  const { academyId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = new URLSearchParams();

  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    if (typeof value === "string") {
      query.set(key, value);
    }
  });

  const suffix = query.toString();
  redirect(`/app/${academyId}/assessments${suffix ? `?${suffix}` : ""}`);
}
