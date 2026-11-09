import type { Metadata } from "next";
import { Schema } from "@/components/Schema";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import MatHero from "@/app/(site)/mat/MatHero";
import {
  AfternoonBoard,
  BeforeAfter,
  MatClose,
  MatFaq,
  ModuleRegister,
  PlansLine,
} from "@/app/(site)/mat/HomeSections";
import { SkipLink } from "@/components/ui/skip-link";
import { ESSENTIAL_FAQS } from "@/lib/launch/essential-public-catalog";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

// Home «Magnesio sobre tapiz». El contenido sale del catálogo público del
// lanzamiento (ESSENTIAL_FEATURES y ESSENTIAL_FAQS); el visible y los datos
// estructurados deben decir lo mismo.
const baseUrl = getPublicSiteUrl();
const description = "Software de gestión en español para academias de gimnasia artística y rítmica. Configuración administrativa para España y México, con registro manual de cuotas.";
export const metadata: Metadata = {
  title: "Zaltyko – Software para academias de gimnasia",
  description,
  alternates: { canonical: baseUrl },
  openGraph: { title: "Zaltyko", description, url: baseUrl, locale: "es_ES", type: "website" },
};

export default function HomePage() {
  return (
    <>
      <SkipLink href="#main-content">Saltar al contenido principal</SkipLink>
      <Navbar />
      <main id="main-content">
        <MatHero />
        <AfternoonBoard />
        <ModuleRegister />
        <BeforeAfter />
        <PlansLine />
        <MatFaq />
        <MatClose />
      </main>
      <Footer />
      <Schema json={{
        "@context": "https://schema.org", "@type": "SoftwareApplication",
        name: "Zaltyko", applicationCategory: "BusinessApplication", operatingSystem: "Web",
        description, url: baseUrl, inLanguage: "es",
      }} />
      <Schema json={{
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: ESSENTIAL_FAQS.map(({ question, answer }) => ({
          "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }} />
    </>
  );
}
