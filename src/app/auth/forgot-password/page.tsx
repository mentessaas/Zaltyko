import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getSafeAuthNextPath } from "@/lib/auth/safe-next-path";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  return (
    <ForgotPasswordForm
      nextPath={getSafeAuthNextPath(params.next ?? null)}
      linkExpired={params.error === "expired"}
    />
  );
}
