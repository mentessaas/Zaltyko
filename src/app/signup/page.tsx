import { redirect } from "next/navigation";

/** Compatibilidad para enlaces históricos de campañas y referidos. */
export default async function SignupPage({
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
