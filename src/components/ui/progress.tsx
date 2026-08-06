"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  indicatorClassName?: string;
  "aria-label"?: string;
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, indicatorClassName, value, "aria-label": ariaLabel, ...props }, ref) => {
  const [animatedValue, setAnimatedValue] = React.useState(value ?? 0);
  const animationFrameRef = React.useRef<number>();

  React.useEffect(() => {
    // Animación suave cuando cambia el valor
    const targetValue = value ?? 0;
    
    // Si el valor no cambió, no hacer nada
    if (targetValue === animatedValue) return;

    // Cancelar animación anterior si existe
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const duration = 800; // 800ms para animación suave
    const startValue = animatedValue;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (targetValue - startValue) * easeOut;
      
      setAnimatedValue(currentValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setAnimatedValue(targetValue);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, animatedValue]);

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      aria-label={ariaLabel ?? "Progreso"}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 bg-primary",
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - animatedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

