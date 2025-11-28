import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Sparkles, type LucideIcon } from "lucide-react";

interface ModuleHeroProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  color: string;
}

export default function ModuleHero({ icon: Icon, title, subtitle, color }: ModuleHeroProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-zaltyko-bg via-white to-white py-20 lg:py-28">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={cn(
          "absolute -top-40 -right-40 h-80 w-80 rounded-full opacity-20 blur-3xl",
          `bg-gradient-to-br ${color}`
        )} />
        <div className={cn(
          "absolute -bottom-40 -left-40 h-80 w-80 rounded-full opacity-10 blur-3xl",
          `bg-gradient-to-br ${color}`
        )} />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          {/* Icon */}
          <div className={cn(
            "inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br text-white mb-8 shadow-lg",
            color
          )}>
            <Icon className="w-10 h-10" />
          </div>

          {/* H1 */}
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-zaltyko-text-main sm:text-5xl lg:text-6xl">
            {title}
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg text-zaltyko-text-secondary sm:text-xl leading-relaxed max-w-2xl mx-auto">
            {subtitle}
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/onboarding"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "shadow-glow hover:shadow-glow-hover transition-all duration-300"
              )}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Empieza gratis
            </Link>
            <Link
              href="/#modulos"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "bg-white/60 backdrop-blur-sm hover:bg-white/80"
              )}
            >
              Ver todos los módulos
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

