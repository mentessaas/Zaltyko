/**
 * Pasos del recorrido de la demo y su clasificación por sección.
 * Módulo puro: lo usan el pie del recorrido y la medición.
 */
export const DEMO_STEPS = [
  { key: "resumen", label: "Resumen", href: "/demo", hint: "El día de la academia de un vistazo." },
  { key: "clases", label: "Clases", href: "/demo/clases", hint: "Horarios semanales y plazas." },
  { key: "asistencia", label: "Asistencia", href: "/demo/asistencia", hint: "Pasar lista en un toque." },
  { key: "gimnastas", label: "Gimnastas", href: "/demo/gimnastas", hint: "Fichas y familias por asignar." },
  { key: "cuotas", label: "Cobros", href: "/demo/cuotas", hint: "Registrar un pago recibido." },
  { key: "familia", label: "Portal de familia", href: "/demo/familia", hint: "Lo que ve cada familia." },
] as const;

export type DemoStepKey = (typeof DEMO_STEPS)[number]["key"];
export type DemoSection = DemoStepKey | "otra";

/**
 * Sección de la demo a la que pertenece una ruta, de una lista cerrada: la
 * medición solo lleva una clave de los pasos o «otra», nunca la ruta tal cual.
 */
export function demoSectionOf(pathname: string): DemoSection {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "demo") return "otra";
  if (segments.length === 1) return "resumen";
  const step = DEMO_STEPS.find((candidate) => candidate.key === segments[1]);
  return step ? step.key : "otra";
}
