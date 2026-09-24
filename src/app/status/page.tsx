import type { Metadata } from "next";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import StatusLivePanel from "./StatusLivePanel";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const baseUrl = getPublicSiteUrl();

export const metadata: Metadata = {
  title: "Estado del servicio",
  description: "Estado operativo de Zaltyko.",
  robots: { index: false, follow: true },
  alternates: { canonical: `${baseUrl}/status` },
};

export default function StatusPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20">
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
              Estado
            </span>
            <h1 className="mt-4 font-display text-3xl font-semibold text-foreground sm:text-4xl">
              Estado del servicio
            </h1>
            <p className="mt-4 text-base text-muted-foreground">
              Consulta las señales verificables de Zaltyko en tiempo real. Si detectas una incidencia,
              contacta con soporte.
            </p>
            <StatusLivePanel />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
