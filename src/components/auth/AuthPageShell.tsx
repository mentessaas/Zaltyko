"use client";

import Link from "next/link";
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
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[minmax(0,520px),1fr]">
        <section className="flex min-h-screen flex-col px-6 py-6 sm:px-8 lg:px-12">
          <div>
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-zaltyko-primary">
                Zaltyko
              </p>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {title}
                </h1>
                <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                  {description}
                </p>
              </div>
            </div>

            <div className="mt-8">{children}</div>

            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
          </div>
        </section>

        <aside className="hidden border-l border-border/70 bg-background lg:flex">
          <div className="flex w-full items-center px-10 py-12 xl:px-14">
            <div className="mx-auto max-w-xl space-y-8">
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-zaltyko-primary">
                  Primeros clientes
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                  {sideTitle}
                </h2>
                <p className="text-base leading-7 text-muted-foreground">{sideDescription}</p>
              </div>

              <div className="grid gap-3">
                {highlights.map((highlight) => (
                  <div
                    key={highlight}
                    className={cn(
                      "flex items-start gap-3 rounded-md border border-border/70 bg-muted/40 px-4 py-4"
                    )}
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-zaltyko-primary" />
                    <p className="text-sm leading-6 text-foreground">{highlight}</p>
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
