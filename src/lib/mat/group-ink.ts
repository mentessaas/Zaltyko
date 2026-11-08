/**
 * Color de grupo dentro de las dos tintas de «Magnesio sobre tapiz».
 *
 * Cada academia elige un color para sus grupos (dato de usuario). Para no
 * meter verdes, naranjas o corales en la interfaz, ese color se traduce de
 * forma estable a uno de los tonos del tapiz: el mismo color de origen da
 * siempre el mismo tono, y grupos distintos siguen siendo distinguibles.
 * El coral queda reservado a alertas.
 */
const MAT_INKS = ["#1E3FA8", "#5B7BE0", "#14307F", "#8FB4FF", "#3E4A66"] as const;

export function groupInk(color: string | null | undefined, fallbackKey?: string): string {
  const key = (color ?? fallbackKey ?? "").toLowerCase().trim();
  if (!key) return MAT_INKS[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return MAT_INKS[hash % MAT_INKS.length];
}
