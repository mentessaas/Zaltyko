"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/**
 * Movimiento de las gráficas de `/owner`. Solo se anima si el navegador lo
 * admite y la persona no ha pedido movimiento reducido; en cualquier otro caso
 * (incluidos los tests) todo aparece directamente en su valor final.
 */
export function chartMotionAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  if (typeof window.IntersectionObserver !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Pasa a true (una sola vez) cuando el elemento entra en pantalla. */
export function useEnteredView<T extends Element>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [entered, setEntered] = useState(() => !chartMotionAllowed());

  useEffect(() => {
    if (entered) return;
    const node = ref.current;
    if (!node) {
      setEntered(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [entered]);

  return [ref, entered];
}

/**
 * Cifra que sube desde cero la primera vez que se ve y, después, del valor
 * anterior al nuevo (por ejemplo, al registrar un pago y refrescar la página).
 * Salida rápida y frenada seca, como el resto del sistema.
 */
export function useRisingNumber(value: number, play: boolean, duration = 700): number {
  const [display, setDisplay] = useState(() => (chartMotionAllowed() ? 0 : value));
  const fromRef = useRef(display);

  useEffect(() => {
    if (!play) return;
    const from = fromRef.current;
    if (from === value || !chartMotionAllowed()) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (value - from) * eased;
      fromRef.current = current;
      setDisplay(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, play, duration]);

  return display;
}

/** Retraso escalonado de una barra (máximo 12 pasos, 45 ms cada uno). */
export function staggerDelay(index: number, step = 45): string {
  return `${Math.min(index, 12) * step}ms`;
}

/** Estilo con el retraso escalonado (`--zk-delay`) que leen las clases zk-*. */
export function delayStyle(delay: string, extra?: CSSProperties): CSSProperties {
  return { ...extra, "--zk-delay": delay } as CSSProperties;
}
