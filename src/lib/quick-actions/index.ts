export interface QuickActionDefinition {
  id: string;
  label: string;
  href: string;
}

export function getQuickActions(academyId: string): QuickActionDefinition[] {
  return [
    {
      id: "attendance",
      label: "Registrar asistencia",
      href: `/app/${academyId}/attendance`,
    },
    {
      id: "athletes",
      label: "Gestionar atletas",
      href: `/app/${academyId}/athletes`,
    },
    {
      id: "classes",
      label: "Revisar clases",
      href: `/app/${academyId}/classes`,
    },
  ];
}

export const QUICK_ACTIONS = ["attendance", "athletes", "classes"] as const;
