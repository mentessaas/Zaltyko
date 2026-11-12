import type { Metadata } from "next";
import { Schema } from "@/components/Schema";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import MatHero from "@/app/(site)/mat/MatHero";
import {
  AfternoonBoard,
  BeforeAfter,
  ImplementedNow,
  MatClose,
  MatFaq,
  ModuleRegister,
  PlansLine,
} from "@/app/(site)/mat/HomeSections";
import { SkipLink } from "@/components/ui/skip-link";
import { homeStructuredData } from "@/lib/launch/home-structured-data";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

// Home «Magnesio sobre tapiz». El contenido sale del catálogo público del
// lanzamiento (ESSENTIAL_FEATURES y ESSENTIAL_FAQS); el visible y los datos
// estructurados deben decir lo mismo.
const baseUrl = getPublicSiteUrl();
const description = "Software de gestión en español para academias de gimnasia: clases, pase de lista y cuotas. Gratis hasta 30 gimnastas. Cualquier país, foco en España y México.";
const structuredData = homeStructuredData({ description, url: baseUrl });
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
        <ImplementedNow />
        <BeforeAfter />
        <PlansLine />
        <MatFaq />
        <MatClose />
      </main>
      <Footer />
      <Schema json={structuredData.softwareApplication} />
      <Schema json={structuredData.faqPage} />
    </>
  );
}
