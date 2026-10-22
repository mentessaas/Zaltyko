"use client";

import { useEffect, useState, useRef } from "react";
import { X, ArrowRight, ArrowLeft, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TutorialStep {
  id: string;
  target: string; // Selector CSS del elemento a destacar
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface InteractiveTutorialProps {
  steps: TutorialStep[];
  onComplete?: () => void;
  onSkip?: () => void;
  enabled?: boolean;
}

export function InteractiveTutorial({
  steps,
  onComplete,
  onSkip,
  enabled = true,
}: InteractiveTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!enabled || steps.length === 0) return;

    // Iniciar tutorial después de un pequeño delay
    const timer = setTimeout(() => {
      setIsActive(true);
      updateTargetElement();
    }, 1000);

    return () => clearTimeout(timer);
  }, [enabled, steps.length]);

  useEffect(() => {
    if (isActive && currentStep < steps.length) {
      updateTargetElement();
      updateTooltipPosition();
    }
  }, [isActive, currentStep, steps]);

  const updateTargetElement = () => {
    if (currentStep >= steps.length) return;
    const step = steps[currentStep];
    const element = document.querySelector(step.target) as HTMLElement;
    setTargetElement(element);
  };

  const updateTooltipPosition = () => {
    if (!targetElement || !tooltipRef.current) return;

    const rect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const step = steps[currentStep];
    const position = step.position || "bottom";

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = rect.top - tooltipRect.height - 16;
        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        break;
      case "bottom":
        top = rect.bottom + 16;
        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
        left = rect.left - tooltipRect.width - 16;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
        left = rect.right + 16;
        break;
    }

    // Asegurar que el tooltip esté dentro del viewport
    const padding = 16;
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

    setTooltipPosition({ top, left });
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsActive(false);
    onComplete?.();
  };

  const handleSkip = () => {
    setIsActive(false);
    onSkip?.();
  };

  if (!isActive || currentStep >= steps.length) return null;

  const step = steps[currentStep];
  const targetRect = targetElement?.getBoundingClientRect();

  return (
    <>
      {/* Overlay oscuro con agujero para el elemento destacado */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
        onClick={handleSkip}
      >
        {targetRect && (
          <div
            className="absolute rounded-lg border-4 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
            style={{
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
            }}
          />
        )}
      </div>

      {/* Tooltip con información */}
      {targetElement && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] w-80 rounded-lg border-2 border-primary bg-background p-4 shadow-2xl"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground">
                Paso {currentStep + 1} de {steps.length}
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <h3 className="font-semibold mb-2">{step.title}</h3>
          <p className="text-sm text-muted-foreground mb-4">{step.description}</p>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handlePrevious}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Anterior
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {step.action && (
                <button
                  onClick={() => {
                    step.action?.onClick();
                    handleNext();
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                >
                  {step.action.label}
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
              >
                {currentStep === steps.length - 1 ? "Finalizar" : "Siguiente"}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

