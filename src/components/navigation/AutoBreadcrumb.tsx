"use client";

import { usePathname } from "next/navigation";
import { useContext } from "react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AcademyContext } from "@/hooks/use-academy-context";

// Mapeo de rutas a nombres legibles
const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  profile: "Mi perfil",
  academies: "Academias",
  athletes: "Atletas",
  coaches: "Entrenadores",
  groups: "Grupos",
  classes: "Clases",
  events: "Eventos",
  billing: "Facturación",
  calendar: "Calendario",
  sessions: "Sesiones",
  users: "Usuarios",
  analytics: "Analíticas",
  "plan-limits": "Límites del plan",
  "super-admin": "Super Admin",
  app: "Academia",
  view: "Ver perfil",
};

// Rutas que no deben mostrar breadcrumb
const excludedPaths = ["/", "/auth", "/onboarding"];

export function AutoBreadcrumb() {
  const pathname = usePathname();
  // Intentar obtener el contexto de academia sin lanzar error si no existe
  const academyContext = useContext(AcademyContext);

  // No mostrar breadcrumb en rutas excluidas
  if (excludedPaths.some((path) => pathname === path || pathname.startsWith(path + "/"))) {
    return null;
  }

  // Dividir la ruta en segmentos
  const segments = pathname.split("/").filter(Boolean);
  
  // Construir los items del breadcrumb
  const items: Array<{ label: string; href?: string }> = [];
  
  let currentPath = "";
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const prevSegment = i > 0 ? segments[i - 1] : null;
    currentPath += `/${segment}`;
    
    // Omitir IDs dinámicos (UUIDs o números largos)
    const isDynamicId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
                        /^\d+$/.test(segment);
    
    if (isDynamicId) {
      // Si es un ID de academia, usar el nombre de la academia y apuntar al dashboard
      if (prevSegment === "app" && academyContext?.academyName) {
        items.push({
          label: academyContext.academyName,
          href: `${currentPath}/dashboard`,
        });
      } else if (prevSegment === "profile" || prevSegment === "view" || prevSegment === "athletes" || prevSegment === "coaches") {
        // Para perfiles/atletas/coaches con ID, usar el nombre del tipo
        const typeLabel = prevSegment === "athletes" ? "Atleta" : 
                         prevSegment === "coaches" ? "Entrenador" : 
                         "Perfil";
        items.push({
          label: typeLabel,
        });
      } else {
        // Para otros IDs, omitir
        continue;
      }
    } else {
      // Omitir "app" ya que será reemplazado por el nombre de la academia
      if (segment === "app" && academyContext) {
        continue;
      }
      
      // Usar el label del mapeo o capitalizar el segmento
      const label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
      
      // El último item no tiene href
      const isLast = i === segments.length - 1;
      
      items.push({
        label,
        href: isLast ? undefined : currentPath,
      });
    }
  }

  // Si no hay items, no mostrar breadcrumb
  if (items.length === 0) {
    return null;
  }

  // Detectar si estamos en super-admin (fondo oscuro)
  const isSuperAdmin = pathname.startsWith("/super-admin");
  
  return (
    <div className={isSuperAdmin ? "mb-4" : "mb-4"}>
      <Breadcrumb 
        items={items} 
        className={isSuperAdmin ? "text-white/80 [&_a]:text-white/80 [&_a:hover]:text-white [&_span]:text-white [&_svg]:text-white/60" : ""}
      />
    </div>
  );
}

