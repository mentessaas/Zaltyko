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
  const title = "Gym SaaS · Gestiona múltiples academias de gimnasia";
  const description =
    "Todo en uno para coordinar atletas, entrenadores y facturación de academias de gimnasia.";

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
      siteName: "Gym SaaS",
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
    <div className="bg-[#212121]">
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
          name: "Gym SaaS",
          description:
            "Software como servicio para academias de gimnasia con dashboards, Stripe y PWA.",
          url: baseUrl,
          sport: "Gymnastics",
        }}
      />
    </div>
  );
}
