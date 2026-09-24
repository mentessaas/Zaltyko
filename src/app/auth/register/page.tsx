import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

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

export default function Register() {
  return <RegisterForm />;
}
