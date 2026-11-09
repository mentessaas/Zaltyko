import { cn } from "@/lib/utils";

/**
 * Palotes de magnesio: cuatro trazos y el quinto cruzado, como se cuentan las
 * series en la pizarra del pabellón. Es la firma del mundo «Magnesio sobre
 * tapiz» y un dato real: el número de trazos es la cifra que se anuncia.
 *
 * Los trazos tienen una ligera inclinación determinista (no aleatoria) para
 * que servidor y cliente pinten lo mismo.
 */
const JITTER = [-2.2, 1.4, -0.6, 2, -1.4, 0.8, -1.8, 1.1];

export function ChalkTally({
  count,
  max,
  className,
  label,
  animate = true,
}: {
  count: number;
  /** Huecos totales (p. ej. plazas del grupo). Los vacíos se dibujan tenues. */
  max?: number;
  className?: string;
  /** Texto accesible; por defecto "N marcas". */
  label?: string;
  animate?: boolean;
}) {
  const total = Math.max(count, max ?? count);
  const groups = Math.ceil(total / 5) || 1;
  const strokes: { x1: number; y1: number; x2: number; y2: number; on: boolean; key: string }[] = [];

  for (let i = 0; i < total; i++) {
    const g = Math.floor(i / 5);
    const k = i % 5;
    const gx = g * 46;
    const on = i < count;
    const j = JITTER[i % JITTER.length];
    if (k < 4) {
      const x = gx + 6 + k * 8;
      strokes.push({ x1: x + j * 0.4, y1: 4, x2: x - j * 0.4, y2: 36, on, key: `s${i}` });
    } else {
      strokes.push({ x1: gx + 1, y1: 30 + j, x2: gx + 37, y2: 10 - j, on, key: `s${i}` });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${groups * 46} 40`}
      role="img"
      aria-label={label ?? `${count} ${count === 1 ? "marca" : "marcas"}`}
      className={cn("h-8 w-auto overflow-visible", className)}
    >
      {strokes.map((s, i) => (
        <line
          key={s.key}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="currentColor"
          strokeWidth={s.on ? 3.4 : 2}
          strokeLinecap="round"
          strokeDasharray={s.on ? 40 : undefined}
          opacity={s.on ? 0.95 : 0.22}
          className={s.on && animate ? "animate-chalk-stroke motion-reduce:animate-none" : undefined}
          style={s.on && animate ? { animationDelay: `${Math.min(i, 12) * 45}ms` } : undefined}
        />
      ))}
    </svg>
  );
}
