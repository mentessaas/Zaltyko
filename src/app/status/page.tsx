import type { Metadata } from "next";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";

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
      <main className="flex-1">
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
              Estado
            </span>
            <h1 className="mt-4 font-display text-3xl font-semibold text-foreground sm:text-4xl">
              Todos los sistemas operativos
            </h1>
            <p className="mt-4 text-base text-muted-foreground">
              Zaltyko funciona con normalidad. Si detectas una incidencia, contacta con soporte.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <div className="rounded-lg border bg-card px-6 py-4 text-left">
                <p className="text-sm font-semibold text-foreground">API</p>
                <p className="text-xs text-emerald-600">Operativo</p>
              </div>
              <div className="rounded-lg border bg-card px-6 py-4 text-left">
                <p className="text-sm font-semibold text-foreground">Auth</p>
                <p className="text-xs text-emerald-600">Operativo</p>
              </div>
              <div className="rounded-lg border bg-card px-6 py-4 text-left">
                <p className="text-sm font-semibold text-foreground">Pagos</p>
                <p className="text-xs text-emerald-600">Operativo</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}