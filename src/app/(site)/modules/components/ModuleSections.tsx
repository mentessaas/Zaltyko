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
              "inline-block text-sm font-semibold uppercase tracking-wider mb-4 bg-gradient-to-r bg-clip-text text-transparent",
              color
            )}>
              La solución
            </span>
            <h2 className="font-display text-2xl font-bold tracking-tight text-zaltyko-text-main sm:text-3xl mb-6">
              {title}
            </h2>
            <div className="prose prose-lg max-w-none text-zaltyko-text-secondary leading-relaxed">
              <p>{content}</p>
            </div>
          </div>

          {/* Features */}
          <div className="bg-white rounded-3xl border border-zaltyko-border p-8 shadow-soft">
            <p className="text-sm font-semibold text-zaltyko-text-main uppercase tracking-wider mb-6">
              Funcionalidades clave
            </p>
            <ul className="space-y-4">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <div className={cn(
                    "flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center mt-0.5",
                    color
                  )}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-zaltyko-text-secondary">{feature}</span>
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
            "inline-block text-sm font-semibold uppercase tracking-wider mb-4 bg-gradient-to-r bg-clip-text text-transparent",
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
              className="relative rounded-2xl bg-zaltyko-bg p-6 border border-zaltyko-border hover:border-zaltyko-primary/30 transition-colors"
            >
              <div className={cn(
                "inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br text-white mb-4",
                color
              )}>
                <benefit.icon className="w-6 h-6" />
              </div>
              <h3 className="font-display text-lg font-semibold text-zaltyko-text-main mb-2">
                {benefit.title}
              </h3>
              <p className="text-sm text-zaltyko-text-secondary">
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
            "inline-block text-sm font-semibold uppercase tracking-wider mb-4 bg-gradient-to-r bg-clip-text text-transparent",
            color
          )}>
            Casos de uso
          </span>
          <h2 className="font-display text-2xl font-bold tracking-tight text-zaltyko-text-main sm:text-3xl">
            ¿Quién se beneficia de este módulo?
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {useCases.map((useCase) => (
            <div
              key={useCase.role}
              className="bg-white rounded-2xl border border-zaltyko-border p-8 shadow-soft hover:shadow-medium transition-shadow"
            >
              <div className={cn(
                "inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br text-white mb-6",
                color
              )}>
                <useCase.icon className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-2">
                {useCase.role}
              </p>
              <h3 className="font-display text-xl font-bold text-zaltyko-text-main mb-3">
                {useCase.title}
              </h3>
              <p className="text-zaltyko-text-secondary leading-relaxed">
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

