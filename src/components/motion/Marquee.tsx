"use client";

type MarqueeProps = {
  items: string[];
  /** Duración del bucle completo en segundos. */
  duration?: number;
  className?: string;
};

/**
 * Cinta continua de texto. Duplica el contenido para un bucle perfecto
 * y se pausa al pasar el ratón. Con reduced-motion se muestra estático.
 */
export default function Marquee({ items, duration = 38, className }: MarqueeProps) {
  const track = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden || undefined} className="contents">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="flex items-center gap-[inherit] whitespace-nowrap font-display text-sm font-semibold text-zaltyko-text-secondary">
          {item}
          <span className="ml-[inherit] font-bold text-zaltyko-electric" aria-hidden="true">
            ·
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      className={`zk-marquee border-y border-border bg-white py-4 ${className ?? ""}`}
      style={
        {
          "--zk-marquee-duration": `${duration}s`,
        } as React.CSSProperties
      }
      role="marquee"
      aria-label="Características del producto"
    >
      <div className="zk-marquee-track px-[17px]">
        {track(false)}
        {track(true)}
      </div>
    </div>
  );
}
