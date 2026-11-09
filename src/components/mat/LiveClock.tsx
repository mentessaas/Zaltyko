"use client";

import { useEffect, useState } from "react";

/**
 * Reloj de pista (donación de la carta de emisión): la hora y el día fijados
 * en una esquina, para saber qué sesión toca sin mirar otra pantalla.
 * Se rellena tras montar para no desajustar la hidratación.
 */
export function LiveClock({ className, timeZone }: { className?: string; timeZone?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const time = now
    ? new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone }).format(now)
    : "--:--";
  const day = now
    ? new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now)
    : "";

  return (
    <div className={className}>
      <p className="font-display tabular text-5xl font-black leading-none" suppressHydrationWarning>
        <time dateTime={now?.toISOString()}>{time}</time>
      </p>
      <p className="floor-label mt-2 first-letter:uppercase" suppressHydrationWarning>
        {day}
      </p>
    </div>
  );
}
