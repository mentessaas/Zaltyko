import type { Metadata } from "next";
import CTA from "@/app/(site)/Cta";
import FAQ from "@/app/(site)/Faq";
import FeaturedTime from "@/app/(site)/FeaturedTime";
import Footer from "@/app/(site)/Footer";
import HeroSection from "@/app/(site)/Hero";
import MakerIntro from "@/app/(site)/MakerIntro";
import Navbar from "@/app/(site)/Navbar";
import PricingSection from "@/app/(site)/pricing";
import TestimonialsPage from "@/app/(site)/Testimonials";
import { Schema } from "@/components/Schema";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Zaltyko — El software profesional para academias de gimnasia";
  const description =
    "Organiza atletas, grupos, horarios, entrenadores, asistencia y pagos… todo desde un solo panel. Sin Excel. Sin caos. Sin WhatsApp.";

  return {
    title,
    description,
    alternates: {
      canonical: baseUrl,
    },
    openGraph: {
      title,
      description,
      url: baseUrl,
      siteName: "Zaltyko",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function Home() {
  return (
    <div className="bg-zaltyko-primary-dark">
      <Navbar />
      <HeroSection />
      <FeaturedTime />
      <MakerIntro />
      <PricingSection />
      <FAQ />
      <TestimonialsPage />
      <CTA />
      <Footer />
      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "SportsClub",
          name: "Zaltyko",
          description:
            "Zaltyko — El sistema definitivo para academias de gimnasia. Registra alumnos, controla pagos, organiza clases y crece sin caos.",
          url: baseUrl,
          sport: "Gymnastics",
        }}
      />
    </div>
  );
}
