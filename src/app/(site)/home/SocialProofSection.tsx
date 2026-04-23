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
            Zaltyko es el software de gestión para academias de gimnasia artística, rítmica y acrobática.
            Empieza tu prueba gratis y descubre cómo podemos ayudarte.
          </p>
        </div>
      </div>
    </section>
  );
}
