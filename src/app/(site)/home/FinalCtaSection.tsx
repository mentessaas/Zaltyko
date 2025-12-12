import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const ctaFeatures = [
  "Sin tarjeta de crédito requerida",
  "Configuración guiada paso a paso",
  "Migración de datos incluida",
  "Soporte durante el onboarding",
];

export default function FinalCtaSection() {
  return (
    <section className="py-20 lg:py-28 bg-gradient-to-br from-zaltyko-primary-dark via-zaltyko-primary to-violet-600">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative">
          {/* Decorative elements */}
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-white/5 rounded-full blur-2xl" />
          
          <div className="relative text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Organiza tu academia como un sistema profesional
            </h2>
            <p className="mt-6 mx-auto max-w-2xl text-lg text-white/80 leading-relaxed">
              Únete a las más de 150 academias de gimnasia que ya simplifican su gestión diaria 
              con Zaltyko. Empieza gratis y escala cuando lo necesites.
            </p>

            {/* Features */}
            <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-4">
              {ctaFeatures.map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm font-medium text-white/90">
                  <CheckCircle2 className="h-5 w-5 text-zaltyko-accent-teal" />
                  {feature}
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/onboarding"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-white text-zaltyko-primary hover:bg-white/90 shadow-lg hover:shadow-xl transition-all duration-300 text-base px-8 py-6"
                )}
              >
                Crea tu cuenta gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="mailto:hola@zaltyko.com"
                className="text-white font-medium hover:text-white/80 transition-colors underline-offset-4 hover:underline"
              >
                ¿Tienes preguntas? Escríbenos
              </Link>
            </div>

            {/* Trust badge */}
            <div className="mt-12 inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 backdrop-blur-sm">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-white/30 to-white/10 border-2 border-white/20"
                  />
                ))}
              </div>
              <p className="text-sm text-white/90">
                <span className="font-semibold">25,000+</span> atletas gestionados este mes
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

