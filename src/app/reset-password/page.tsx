import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getSafeAuthNextPath } from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear contraseña nueva",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = getSafeAuthNextPath(params.next ?? null);
  const client = await createClient(await cookies());
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    redirect(
      `/auth/forgot-password?error=expired&next=${encodeURIComponent(nextPath)}`
    );
  }
  return <ResetPasswordForm nextPath={nextPath} />;
}
