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

export default function ModuleHero({ icon: Icon, title, subtitle }: ModuleHeroProps) {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          {/* Icon */}
          <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-card bg-zaltyko-primary-ultralight">
            <Icon className="w-10 h-10 text-zaltyko-teal" />
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
              href="/auth/register?role=owner"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "shadow-soft transition-all duration-150 hover:shadow-medium"
              )}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Crea tu academia gratis
            </Link>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-zaltyko-mist hover:bg-zaltyko-white"
              )}
            >
              Ver planes y precios
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
