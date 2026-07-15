import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Regístrate en Zaltyko como academia, entrenador, familia, atleta o proveedor",
  alternates: {
    canonical: `${getPublicSiteUrl()}/auth/register`,
  },
  openGraph: {
    title: "Crear cuenta",
    description: "Crea una cuenta personal en Zaltyko y elige tu rol inicial",
    url: `${getPublicSiteUrl()}/auth/register`,
    type: "website",
  },
};

export default function Register() {
  return <RegisterForm />;
}
