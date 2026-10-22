import { AppError } from "@/lib/errors";

export const FAMILY_AUTOMATIC_COLLECTION_DISABLED =
  "FAMILY_AUTOMATIC_COLLECTION_DISABLED" as const;

export const FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE =
  "El cobro automático familiar no está disponible. Registra los pagos manualmente o contacta con soporte.";

/** Domain barrier for all family collection and card-setup service entry points. */
export class FamilyAutomaticCollectionDisabledError extends AppError {
  constructor() {
    super(
      FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
      FAMILY_AUTOMATIC_COLLECTION_DISABLED,
      410
    );
    this.name = "FamilyAutomaticCollectionDisabledError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function throwFamilyAutomaticCollectionDisabled(): void {
  throw new FamilyAutomaticCollectionDisabledError();
}
