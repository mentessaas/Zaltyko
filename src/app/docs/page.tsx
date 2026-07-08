"use client";

import dynamic from "next/dynamic";
import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";

const SwaggerUI = dynamic(() => import("swagger-ui-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Cargando documentación de la API…</p>
    </div>
  ),
});

export default function ApiDoc() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto py-10">
        <div className="rounded-lg border bg-card shadow-sm">
          <SwaggerUI url="/api/docs" />
        </div>
      </main>
      <Footer />
    </div>
  );
}