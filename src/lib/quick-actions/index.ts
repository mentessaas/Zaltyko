// Compatibilidad para imports antiguos: la implementación canónica vive en
// `src/lib/quick-actions.ts`. Mantener un único catálogo evita que una vista
// reciba accidentalmente una lista vacía de acciones.
export { getQuickActions, QUICK_ACTIONS } from "../quick-actions";
export type { QuickAction } from "../quick-actions";
