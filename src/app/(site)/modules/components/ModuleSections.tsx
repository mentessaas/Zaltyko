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
  content?: string;
  bullets?: string[];
  color: string;
}

export function ProblemSection({ title, content, bullets }: ProblemSectionProps) {
  return (
    <section className="py-16 lg:py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="mb-4 inline-block text-sm font-semibold uppercase tracking-wider text-zaltyko-teal">
              El problema
            </span>
            <h2 className="font-display text-2xl font-bold tracking-tight text-zaltyko-text-main sm:text-3xl">
              {title}
            </h2>
          </div>
          {bullets ? (
            <ul className="space-y-4 max-w-3xl mx-auto">
              {bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 text-zaltyko-text-secondary text-lg leading-relaxed"
                >
                  <span
                    className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-zaltyko-teal"
                    aria-hidden
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="prose prose-lg max-w-none text-zaltyko-text-secondary leading-relaxed">
              <p>{content}</p>
            </div>
          )}
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

export function SolutionSection({ title, content, features }: SolutionSectionProps) {
  return (
    <section className="py-16 lg:py-20 bg-zaltyko-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <span className="mb-4 inline-block text-sm font-bold uppercase tracking-wider text-zaltyko-teal">
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
          <div className="bg-white rounded-3xl border border-zaltyko-border/50 p-8 shadow-xl shadow-zaltyko-primary/5 relative overflow-hidden group">
            <div className="pointer-events-none absolute inset-0 bg-zaltyko-teal/5 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
            <p className="text-sm font-bold text-zaltyko-text-main uppercase tracking-wider mb-6 relative">
              Funcionalidades clave
            </p>
            <ul className="space-y-4 relative">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 group/item">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-control bg-zaltyko-primary-ultralight">
                    <CheckCircle2 className="w-4 h-4 text-zaltyko-teal" />
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

export function BenefitsSection({ benefits }: BenefitsSectionProps) {
  return (
    <section className="py-16 lg:py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="mb-4 inline-block text-sm font-bold uppercase tracking-wider text-zaltyko-teal">
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
              <div className="pointer-events-none absolute inset-0 bg-zaltyko-teal/5 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-card bg-zaltyko-primary-ultralight transition-transform duration-300 group-hover:scale-110">
                <benefit.icon className="w-7 h-7 text-zaltyko-teal" />
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

export function UseCasesSection({ useCases }: UseCasesSectionProps) {
  return (
    <section className="py-16 lg:py-20 bg-zaltyko-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="mb-4 inline-block text-sm font-bold uppercase tracking-wider text-zaltyko-teal">
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
              className="bg-white rounded-2xl border border-zaltyko-border/50 p-8 shadow-lg hover:shadow-2xl hover:shadow-zaltyko-primary/10 transition-all duration-300 hover:-translate-y-2 group"
            >
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-card bg-zaltyko-primary-ultralight transition-transform duration-300 group-hover:scale-110">
                <useCase.icon className="w-8 h-8 text-zaltyko-teal" />
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
    <section className="relative overflow-hidden bg-zaltyko-navy py-16 lg:py-20">
      <div className="absolute inset-0 zaltyko-motion-lines opacity-60" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg text-white/80">
            {subtitle}
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/auth/register?role=owner"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-zaltyko-teal text-white hover:bg-primary-dark shadow-brand"
              )}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Crear mi academia gratis
            </Link>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-white/20 bg-white/10 text-white hover:bg-white/20"
              )}
            >
              Ver planes y precios
            </Link>
          </div>
          <p className="mt-4 text-sm text-white/60">
            Sin tarjeta de crédito · Puesta en marcha guiada
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
