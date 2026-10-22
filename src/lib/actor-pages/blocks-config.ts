/**
 * Configuración de bloques disponibles por tipo de actor.
 *
 * Sprint 4: cada tipo tiene su propio conjunto de bloques disponibles.
 * El editor en Sprint 4 sigue siendo simple (drag up/down + show/hide),
 * pero el render público sabe qué bloques existen por tipo.
 */

export type EntityType = "academy" | "coach" | "athlete" | "supplier";

export type BlockDef = {
  type: string;
  heading: string;
  /** Bloque obligatorio para el tipo (no se puede ocultar) */
  required?: boolean;
  description?: string;
};

export const BLOCKS_BY_TYPE: Record<EntityType, BlockDef[]> = {
  academy: [
    { type: "hero", heading: "Hero / Sobre nosotros", required: true },
    { type: "about", heading: "Historia" },
    { type: "sports", heading: "Deportes que ofrecemos" },
    { type: "schedule", heading: "Horarios recurrentes" },
    { type: "coaches", heading: "Nuestro equipo de coaches" },
    { type: "facilities", heading: "Instalaciones" },
    { type: "pricing", heading: "Precios y planes" },
    { type: "location", heading: "Ubicación" },
    { type: "gallery", heading: "Galería de fotos" },
    { type: "achievements", heading: "Logros de la academia" },
    { type: "contact", heading: "Contacto", required: true },
  ],
  coach: [
    { type: "hero", heading: "Sobre mí", required: true },
    { type: "bio", heading: "Biografía", required: true },
    { type: "certifications", heading: "Certificaciones" },
    { type: "sports", heading: "Deportes que enseño" },
    { type: "current_academies", heading: "Academias donde trabajo" },
    { type: "achievements", heading: "Logros profesionales" },
    { type: "gallery", heading: "Galería" },
    { type: "contact", heading: "Contacto" },
  ],
  athlete: [
    { type: "hero", heading: "Sobre mí", required: true },
    { type: "bio", heading: "Biografía" },
    { type: "sports", heading: "Deportes que practico" },
    { type: "achievements", heading: "Medallas y resultados" },
    { type: "gallery", heading: "Galería de competiciones" },
  ],
  supplier: [
    { type: "hero", heading: "Sobre la empresa", required: true },
    { type: "about", heading: "Descripción" },
    { type: "catalog_categories", heading: "Categorías de catálogo" },
    { type: "products", heading: "Productos destacados" },
    { type: "certifications", heading: "Certificaciones de calidad" },
    { type: "service_area", heading: "Zonas de servicio" },
    { type: "contact", heading: "Contacto" },
  ],
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  academy: "Academia",
  coach: "Entrenador",
  athlete: "Gimnasta",
  supplier: "Proveedor",
};

export const ENTITY_LABEL_PLURAL: Record<EntityType, string> = {
  academy: "Academias",
  coach: "Entrenadores",
  athlete: "Gimnastas",
  supplier: "Proveedores",
};

export const ENTITY_PATH_PREFIX: Record<EntityType, string> = {
  academy: "a",
  coach: "c",
  athlete: "g",
  supplier: "p",
};
