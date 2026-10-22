import { redirect } from "next/navigation";

/** Alias en español para no perder conversiones desde campañas antiguas. */
export default async function RegistroPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const role = typeof params.role === "string" && ["owner", "coach", "parent", "athlete", "provider"].includes(params.role)
    ? params.role
    : null;
  redirect(role ? `/auth/register?role=${encodeURIComponent(role)}` : "/auth/register");
}
