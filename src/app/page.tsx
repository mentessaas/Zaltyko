import type { Metadata } from "next";
import { Schema } from "@/components/Schema";
import Navbar from "@/app/(site)/Navbar";
import HeroSection from "@/app/(site)/home/HeroSection";
import FeaturesSection from "@/app/(site)/FeaturesSection";
import FaqSection from "@/app/(site)/home/FaqSection";
import FinalCtaSection from "@/app/(site)/home/FinalCtaSection";
import Footer from "@/app/(site)/Footer";
import StickyCtaBar from "@/app/(site)/home/StickyCtaBar";
import { SkipLink } from "@/components/ui/skip-link";
import Marquee from "@/components/motion/Marquee";
import { ESSENTIAL_FAQS } from "@/lib/launch/essential-public-catalog";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();
const description = "Gestiona gimnastas, familias, grupos, clases, asistencia y cuotas con registro manual de pagos para tu academia de gimnasia en España.";
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
        <HeroSection />
        <Marquee items={["Gimnastas y familias", "Grupos y clases", "Inscripciones", "Asistencia por sesión", "Cuotas manuales", "Resumen de actividad"]} />
        <FeaturesSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
      <StickyCtaBar />
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
