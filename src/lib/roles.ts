const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super administrador",
  admin: "Administrador",
  owner: "Propietario",
  coach: "Entrenador",
  athlete: "Atleta",
  parent: "Tutor",
};

export function getRoleLabel(role?: string | null): string {
  if (!role) {
    return "Sin rol";
  }
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

