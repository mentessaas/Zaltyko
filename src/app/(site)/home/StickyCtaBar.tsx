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
      <div className="bg-white/95 backdrop-blur-lg border-t border-gray-200 shadow-[0_-4px_30px_rgba(0,0,0,0.1)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          {/* Left: message */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-sm text-gray-700 truncate">
              <span className="font-semibold text-gray-900">Empieza gratis</span> · Sin tarjeta ·{" "}
              <span className="text-red-600 font-bold">19€/mes → 29€ en Q3</span>
            </p>
          </div>

          {/* Right: CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/onboarding"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "bg-red-600 hover:bg-red-700 shadow-md rounded-full text-sm px-5 py-2"
              )}
            >
              Crear mi academia
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
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
