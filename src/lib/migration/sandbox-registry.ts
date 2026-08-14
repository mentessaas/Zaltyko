import { SandboxMigrationStore } from "./sandbox";

/**
 * Registry en memoria deliberadamente limitado al entorno sandbox. No es una
 * cola productiva ni una persistencia de dominio; el contrato exige que este
 * trabajo no toque producción ni una migración remota.
 */
export const sandboxMigrationStore = new SandboxMigrationStore();
