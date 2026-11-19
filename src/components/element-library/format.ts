/**
 * Formato de los datos de la biblioteca para la academia. Sin dependencias de
 * servidor: lo usan la pantalla de la biblioteca y el selector de elementos.
 */

/** Letra «D» tal cual; puntos de salto con coma decimal: 4.2 → «4,20 p.». */
export function formatCatalogValue(element: { valueLetter: string | null; valuePoints: number | null }): string {
  if (element.valueLetter) return element.valueLetter;
  if (element.valuePoints !== null && Number.isFinite(element.valuePoints)) {
    return `${element.valuePoints.toFixed(2).replace(".", ",")} p.`;
  }
  return "Sin valor";
}

/** Referencia del Código, solo como referencia: «3.12» → «Nº 3.12». */
export function formatFigReference(reference: string): string {
  return `Nº ${reference}`;
}

/** «Grupo 4» o, si la edición le da nombre, «Grupo 4 · Yurchenko: rondada y mortal atrás». */
export function formatCatalogGroup(group: string, label?: string | null): string {
  return label ? `Grupo ${group} · ${label}` : `Grupo ${group}`;
}
