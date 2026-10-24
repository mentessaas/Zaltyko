import { flag } from "@/lib/directory/contracts";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { getOwnerSignupConsentPolicyVersion } from "@/modules/organizations/application/owner-signup-consent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta personal en Zaltyko y elige si vas a gestionar una academia, entrenar, acompañar a una familia o publicar servicios",
  alternates: {
    canonical: `${getPublicSiteUrl()}/auth/register`,
  },
  openGraph: {
    title: "Crear cuenta",
    description: "Crea una cuenta personal en Zaltyko y elige tu rol inicial; la academia se configura después",
    url: `${getPublicSiteUrl()}/auth/register`,
    type: "website",
  },
};

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const ownerEntry = query.role === "owner";
  let ownerConsentPolicyVersion: string | null = null;
  try {
    ownerConsentPolicyVersion = await getOwnerSignupConsentPolicyVersion();
  } catch {
    // Registration remains available, but the client must omit a declaration
    // it cannot bind to the current server policy. Owner setup then fails
    // closed and asks for explicit acceptance if the policy store recovers.
  }

  return (
    <RegisterForm
      ownerEntry={ownerEntry}
      ownerConsentPolicyVersion={ownerConsentPolicyVersion}
      directoryDiscoveryEnabled={flag("catalog")}
      directoryClaimsEnabled={flag("claims")}
    />
  );
}
