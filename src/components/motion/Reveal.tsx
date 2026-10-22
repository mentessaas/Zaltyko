"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./motion.css";

type RevealProps = {
  children: ReactNode;
  /** Retardo en ms para escalonar hermanos. */
  delay?: number;
  className?: string;
};

/**
 * Envuelve contenido y lo revela con una entrada suave cuando entra en viewport.
 * Sin JavaScript (o con reduced-motion) el contenido es visible por defecto.
 */
export default function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("zk-reveal", visible && "zk-reveal-in", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {/* Sin JavaScript el contenido nunca queda oculto */}
      <noscript>
        <style>{`.zk-reveal{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
      {children}
    </div>
  );
}
