import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Historial de cambios y mejoras de Zaltyko.",
  robots: { index: false, follow: true },
  alternates: { canonical: `${baseUrl}/changelog` },
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
              Changelog
            </span>
            <h1 className="mt-4 font-display text-3xl font-semibold text-foreground sm:text-4xl">
              Próximamente
            </h1>
            <p className="mt-4 text-base text-muted-foreground">
              Estamos preparando un historial público de cambios y mejoras. Mientras tanto, cada release
              se comunica a las academias activas desde el panel.
            </p>
            <div className="mt-8">
              <Link
                href="/contact?type=other"
                className="inline-flex items-center justify-center rounded-full bg-zaltyko-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Contactar
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}