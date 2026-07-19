"use client";

import { cn } from "@/lib/utils";

// Stats removed - no real data to support these numbers
// TODO: Add real stats when available from production data

export default function SocialProofSection() {
  return (
    <section className="py-16 bg-white border-y border-gray-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Zaltyko está enfocado en academias de gimnasia artística femenina, artística masculina y rítmica.
            Una herramienta específica para dirección, entrenadores, gimnastas y familias.
          </p>
        </div>
      </div>
    </section>
  );
}
