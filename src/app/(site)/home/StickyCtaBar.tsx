"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default function StickyCtaBar() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const handleScroll = () => {
      // Show after scrolling past 50vh
      if (window.scrollY > window.innerHeight * 0.5 && !dismissed) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [mounted, dismissed]);

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted || !visible || dismissed) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 animate-in slide-in-from-bottom-5 sm:bottom-4 sm:left-4 sm:right-4">
      <div className="mx-auto max-w-5xl rounded-2xl border border-zaltyko-mist/80 bg-white/95 shadow-medium backdrop-blur-lg">
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-4">
          {/* Left: message */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zaltyko-teal/10 sm:flex">
              <Sparkles aria-hidden="true" className="h-4 w-4 text-zaltyko-teal" />
            </div>
            <p className="min-w-0 text-xs leading-5 text-zaltyko-text-secondary sm:text-sm">
              <span className="font-semibold text-zaltyko-navy">Tu academia, en ritmo.</span>
              <span className="hidden sm:inline"> Gratis hasta 30 gimnastas.</span>
            </p>
          </div>

          {/* Right: CTA */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/auth/register?role=owner"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "min-h-11 rounded-xl bg-zaltyko-teal px-3 text-xs shadow-soft hover:bg-zaltyko-primary-dark sm:px-5 sm:text-sm"
              )}
            >
              <span className="sm:hidden">Empezar gratis</span>
              <span className="hidden sm:inline">Crear academia gratis</span>
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-zaltyko-text-secondary transition hover:bg-zaltyko-white hover:text-zaltyko-navy"
              aria-label="Cerrar invitación para crear una academia"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
