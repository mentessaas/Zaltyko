import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Shield,
  Users,
  Briefcase,
  GraduationCap,
  type LucideIcon 
} from "lucide-react";

/* ========================================
   PROBLEM SECTION
   ======================================== */

interface ProblemSectionProps {
  title: string;
  content: string;
  color: string;
}

export function ProblemSection({ title, content, color }: ProblemSectionProps) {
  return (
    <section className="py-16 lg:py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className={cn(
              "inline-block text-sm font-semibold uppercase tracking-wider mb-4 bg-gradient-to-r bg-clip-text text-transparent",
              color
            )}>
              El problema
            </span>
            <h2 className="font-display text-2xl font-bold tracking-tight text-zaltyko-text-main sm:text-3xl">
              {title}
            </h2>
          </div>
          <div className="prose prose-lg max-w-none text-zaltyko-text-secondary leading-relaxed">
            <p>{content}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========================================
   SOLUTION SECTION
   ======================================== */

interface SolutionSectionProps {
  title: string;
  content: string;
  features: string[];
  color: string;
}

export function SolutionSection({ title, content, features, color }: SolutionSectionProps) {
  return (
    <section className="py-16 lg:py-20 bg-zaltyko-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <span className={cn(
              "inline-block text-sm font-bold uppercase tracking-wider mb-4 bg-gradient-to-r bg-clip-text text-transparent",
              color
            )}>
              La solucion
            </span>
            <h2 className="font-display text-2xl font-bold tracking-tight text-zaltyko-text-main sm:text-3xl mb-6">
              {title}
            </h2>
            <div className="prose prose-lg max-w-none text-zaltyko-text-secondary leading-relaxed">
              <p>{content}</p>
            </div>
          </div>

          {/* Features */}
          <div className="bg-white rounded-3xl border border-zaltyko-border/50 p-8 shadow-xl shadow-zaltyko-primary/5 relative overflow-hidden group">
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none", color.replace("from-", "from-").replace("to-", "/20 to-"))} />
            <p className="text-sm font-bold text-zaltyko-text-main uppercase tracking-wider mb-6 relative">
              Funcionalidades clave
            </p>
            <ul className="space-y-4 relative">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 group/item">
                  <div className={cn(
                    "flex-shrink-0 w-7 h-7 rounded-xl bg-gradient-to-br flex items-center justify-center mt-0.5 shadow-lg",
                    color
                  )}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-zaltyko-text-secondary font-medium group-hover/item:text-zaltyko-text-main transition-colors">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========================================
   BENEFITS SECTION
   ======================================== */

interface Benefit {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface BenefitsSectionProps {
  benefits: Benefit[];
  color: string;
}

export function BenefitsSection({ benefits, color }: BenefitsSectionProps) {
  return (
    <section className="py-16 lg:py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className={cn(
            "inline-block text-sm font-bold uppercase tracking-wider mb-4 bg-gradient-to-r bg-clip-text text-transparent",
            color
          )}>
            Beneficios
          </span>
          <h2 className="font-display text-2xl font-bold tracking-tight text-zaltyko-text-main sm:text-3xl">
            Resultados medibles para tu academia
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="relative rounded-2xl bg-zaltyko-bg p-6 border border-zaltyko-border/50 hover:border-zaltyko-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-zaltyko-primary/10 hover:-translate-y-1 group overflow-hidden"
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none", color.replace("from-", "from-").replace("to-", "/10 to-"))} />
              <div className={cn(
                "inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br text-white mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300",
                color
              )}>
                <benefit.icon className="w-7 h-7" />
              </div>
              <h3 className="font-display text-lg font-bold text-zaltyko-text-main mb-2 group-hover:text-zaltyko-primary transition-colors">
                {benefit.title}
              </h3>
              <p className="text-sm text-zaltyko-text-secondary font-medium">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================================
   USE CASES SECTION
   ======================================== */

interface UseCase {
  role: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

interface UseCasesSectionProps {
  useCases: UseCase[];
  color: string;
}

export function UseCasesSection({ useCases, color }: UseCasesSectionProps) {
  return (
    <section className="py-16 lg:py-20 bg-zaltyko-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className={cn(
            "inline-block text-sm font-bold uppercase tracking-wider mb-4 bg-gradient-to-r bg-clip-text text-transparent",
            color
          )}>
            Casos de uso
          </span>
          <h2 className="font-display text-2xl font-bold tracking-tight text-zaltyko-text-main sm:text-3xl">
            Quien se beneficia de este modulo?
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {useCases.map((useCase) => (
            <div
              key={useCase.role}
              className="bg-white rounded-2xl border border-zaltyko-border/50 p-8 shadow-lg hover:shadow-2xl hover:shadow-zaltyko-primary/10 transition-all duration-300 hover:-translate-y-2 group"
            >
              <div className={cn(
                "inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br text-white mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300",
                color
              )}>
                <useCase.icon className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-zaltyko-primary uppercase tracking-wider mb-2 group-hover:translate-x-1 transition-transform">
                {useCase.role}
              </p>
              <h3 className="font-display text-xl font-bold text-zaltyko-text-main mb-3 group-hover:text-zaltyko-primary transition-colors">
                {useCase.title}
              </h3>
              <p className="text-zaltyko-text-secondary leading-relaxed font-medium">
                {useCase.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================================
   MODULE CTA SECTION
   ======================================== */

interface ModuleCtaProps {
  title?: string;
  subtitle?: string;
}

export function ModuleCta({ 
  title = "Optimiza tu academia hoy mismo",
  subtitle = "Únete a las academias que ya están simplificando su gestión con Zaltyko"
}: ModuleCtaProps) {
  return (
    <section className="py-16 lg:py-20 bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg text-white/80">
            {subtitle}
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/onboarding"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-white text-zaltyko-primary hover:bg-white/90 shadow-lg"
              )}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Crear mi academia gratis
            </Link>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-white/30 text-white hover:bg-white/10"
              )}
            >
              Ver planes y precios
            </Link>
          </div>
          <p className="mt-4 text-sm text-white/60">
            Sin tarjeta de crédito · Configuración en 5 minutos
          </p>
        </div>
      </div>
    </section>
  );
}

/* ========================================
   EXPORT ICONS FOR USE CASES
   ======================================== */

export const UseCaseIcons = {
  Users,
  Briefcase,
  GraduationCap,
  Clock,
  TrendingUp,
  Shield,
};

