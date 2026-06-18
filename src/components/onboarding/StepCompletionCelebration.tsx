"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepCompletionCelebrationProps {
  show: boolean;
  stepNumber: number;
  stepName: string;
  onComplete?: () => void;
}

export function StepCompletionCelebration({
  show,
  stepNumber,
  stepName,
  onComplete,
}: StepCompletionCelebrationProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (show) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show || !isAnimating) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={cn(
          "relative rounded-2xl border-2 border-green-500 bg-background p-8 shadow-2xl",
          "animate-in zoom-in-95 fade-in-0 duration-300"
        )}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-green-500/20" />
            <CheckCircle2 className="relative h-16 w-16 text-green-500" />
            <Sparkles className="absolute -right-2 -top-2 h-6 w-6 animate-bounce text-yellow-400" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-bold">¡Paso {stepNumber} completado!</h3>
            <p className="mt-2 text-muted-foreground">{stepName}</p>
          </div>
          <div className="h-1 w-32 animate-pulse rounded-full bg-green-500" />
        </div>
      </div>
    </div>
  );
}

