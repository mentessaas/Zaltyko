import { notFound } from "next/navigation";

// Advanced analytics is excluded from the essential public launch.
export const dynamic = "force-dynamic";
export default async function OwnerInsightsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  void props;
  notFound();
}
