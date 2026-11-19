/**
 * Fachada de la biblioteca de elementos (ADR-0029 §1, §2, §3 y §11).
 *
 * Rutas, páginas, otros módulos y pruebas importan solo desde aquí. Los
 * archivos de `application/` son internos:
 * - storage.ts: banderas, tablas de las candidatas y formas de niveles y guiones.
 * - access.ts: autorización (equipo técnico, sede y plan en solo lectura).
 * - catalog-reads.ts: búsqueda, ficha, vista de enlaces y uso habitual.
 * - notes.ts: nota de la academia sobre un elemento.
 * - page-data.ts: disciplinas publicadas y nombres de los grupos para la página.
 * Cada operación de la academia abre su propia transacción y vuelve a
 * autorizarlo todo. `getCatalogLinkView` y `findLinkableCatalogElement` no
 * autorizan: las llaman niveles y guiones con su cliente, dentro de su
 * transacción ya autorizada. Nunca se importa `domain/data-files.ts` (lee el
 * disco) desde aquí.
 */
export {
  findLinkableCatalogElement,
  getCatalogElement,
  getCatalogLinkView,
  recordElementLibraryView,
  searchCatalogElements,
} from "./catalog-reads";
export { saveElementNote } from "./notes";
export {
  getEditionGroupLabels,
  listPublishedCatalogDisciplines,
  type EditionGroupLabel,
  type EditionGroupLabels,
} from "./page-data";
export {
  assertElementLibraryAvailable,
  elementLibraryUnavailable,
  isElementLibraryAvailable,
  isElementLibraryAvailableForPage,
  isElementLibraryStorageInstalled,
} from "./storage";
export type {
  CatalogElementCard,
  CatalogElementSummary,
  CatalogLinkStatus,
  CatalogLinkView,
  CatalogSearchResult,
  EditionView,
  ElementNoteView,
  SaveElementNoteResult,
} from "@/modules/element-library/domain/library-requests";
