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
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-5">
      <div className="border-t border-zaltyko-mist bg-white/95 backdrop-blur-lg shadow-[0_-4px_30px_rgba(15,23,42,0.08)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          {/* Left: message */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zaltyko-teal/10">
              <Sparkles className="h-4 w-4 text-zaltyko-teal" />
            </div>
            <p className="truncate text-sm text-zaltyko-text-secondary">
              <span className="font-semibold text-zaltyko-navy">Artística y rítmica</span> · Demo guiada ·{" "}
              <span className="font-bold text-zaltyko-indigo">Planes por tamaño de academia</span>
            </p>
          </div>

          {/* Right: CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/contact?type=demo"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "rounded-full bg-zaltyko-teal px-5 py-2 text-sm shadow-soft hover:bg-primary-dark"
              )}
            >
              Solicitar demo
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="text-gray-600 hover:text-gray-600 transition-colors p-1"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
