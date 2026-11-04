import { z } from "zod";

/** Availability is independent of billing, operational capacity and permissions. */
export type FeatureAvailability = "available" | "beta" | "planned" | "hidden";
export const FEATURE_CATALOG_VERSION = "2026-11-04-v1";
export const featureIdSchema = z.enum(["club-events", "club-acquisition", "sport-progression"]);
export type DiscoveryFeatureId = z.infer<typeof featureIdSchema>;

export interface DiscoveryFeature {
  id: DiscoveryFeatureId;
  title: string;
  summary: string;
  status: FeatureAvailability;
  statusLabel: string;
  roles: readonly string[];
  intents: readonly { id: string; label: string }[];
}

// No dates, paid-tier promises or executable operational links for planned work.
export const FEATURE_CATALOG: readonly DiscoveryFeature[] = [
  {
    id: "club-events", title: "Competiciones y conexión entre clubes",
    summary: "Propuesta para organizar encuentros, descubrir eventos e inscribir delegaciones. Todavía no permite crear competiciones ni inscribir participantes.",
    status: "planned", statusLabel: "En preparación", roles: ["owner", "admin", "manager"],
    intents: [{ id: "organize", label: "Organizar una competición" }, { id: "participate", label: "Participar con mi club" }],
  },
  {
    id: "club-acquisition", title: "De la web a la inscripción",
    summary: "Propuesta para conectar solicitudes, clases de prueba y oferta de plazas. Este recorrido todavía no está disponible.",
    status: "planned", statusLabel: "En preparación", roles: ["owner", "admin"],
    intents: [{ id: "capture", label: "Recibir solicitudes" }, { id: "convert", label: "Convertir pruebas en inscripciones" }],
  },
  {
    id: "sport-progression", title: "Planificación y progreso deportivo",
    summary: "Propuesta para conectar objetivos y progreso con las sesiones del club, comenzando por artística femenina y masculina. Todavía no ofrece evaluaciones ni cálculos reglamentarios.",
    status: "planned", statusLabel: "En preparación", roles: ["owner", "admin", "manager"],
    intents: [{ id: "plan", label: "Preparar el trabajo de las sesiones" }, { id: "track", label: "Seguir los objetivos deportivos" }],
  },
];

export const discoveryCommandSchema = z.object({
  featureId: featureIdSchema,
  action: z.enum(["exposure", "open", "interest", "withdraw"]),
  intent: z.string().max(30).optional(),
  pilot: z.boolean().optional(),
}).strict().superRefine((command, context) => {
  const feature = FEATURE_CATALOG.find(item => item.id === command.featureId)!;
  if (command.action === "interest") {
    if (!feature.intents.some(item => item.id === command.intent)) {
      context.addIssue({ code: "custom", path: ["intent"], message: "Selecciona una necesidad de esta propuesta" });
    }
  } else if (command.intent !== undefined || command.pilot !== undefined) {
    context.addIssue({ code: "custom", message: "Esta acción no admite una selección de interés" });
  }
});
export type DiscoveryCommand = z.infer<typeof discoveryCommandSchema>;

export function discoverableFeatures(role: string): readonly DiscoveryFeature[] {
  return FEATURE_CATALOG.filter(feature => feature.status === "planned" && feature.roles.includes(role)).slice(0, 3);
}
