"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface AuthPageShellProps {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  footer: React.ReactNode;
  children: React.ReactNode;
  sideTitle: string;
  sideDescription: string;
  highlights: string[];
}

export function AuthPageShell({
  title,
  description,
  backHref = "/",
  backLabel = "Volver",
  footer,
  children,
  sideTitle,
  sideDescription,
  highlights,
}: AuthPageShellProps) {
  return (
    <div className="min-h-screen overflow-hidden bg-zaltyko-navy text-white">
      <div className="pointer-events-none absolute inset-0 opacity-80 zaltyko-motion-lines" />
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[minmax(0,520px),1fr]">
        <section className="relative flex min-h-screen flex-col px-6 py-6 sm:px-8 lg:px-12">
          <div>
            <Link
              href={backHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
            <div className="rounded-2xl border border-white/10 bg-zaltyko-white p-6 text-zaltyko-navy shadow-medium sm:p-8">
              <div className="space-y-5">
                <Image
                  src="/branding/zaltyko/logo-zaltyko.svg"
                  alt="Zaltyko"
                  width={132}
                  height={38}
                  className="h-9 w-auto"
                  priority
                />
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-zaltyko-teal">
                    Acceso seguro
                  </p>
                  <h1 className="font-display text-3xl font-semibold tracking-normal text-zaltyko-navy sm:text-4xl">
                    {title}
                  </h1>
                  <p className="text-sm leading-6 text-zaltyko-text-secondary sm:text-base">
                    {description}
                  </p>
                </div>
              </div>

              <div className="mt-8">{children}</div>

              <div className="mt-6 text-sm text-zaltyko-text-secondary">{footer}</div>
            </div>
          </div>
        </section>

        <aside className="relative hidden border-l border-white/10 lg:flex">
          <div className="flex w-full items-center px-10 py-12 xl:px-14">
            <div className="mx-auto max-w-xl space-y-8">
              <div className="space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-zaltyko-teal">
                  Zaltyko
                </p>
                <h2 className="font-display text-4xl font-semibold tracking-normal text-white">
                  {sideTitle}
                </h2>
                <p className="text-base leading-7 text-white/64">{sideDescription}</p>
              </div>

              <div className="grid gap-3">
                {highlights.map((highlight) => (
                  <div
                    key={highlight}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4"
                    )}
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-zaltyko-teal" />
                    <p className="text-sm leading-6 text-white/78">{highlight}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
