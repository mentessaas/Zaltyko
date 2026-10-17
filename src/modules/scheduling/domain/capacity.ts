export interface CapacityInputs {
  templateCapacity: number;
  spaceCapacity?: number | null;
  sessionCapacityOverride?: number | null;
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
}

/**
 * Capacity is constrained by the most restrictive configured source.
 * A session override can reduce or expand the template, but never beyond the
 * assigned physical space.
 */
export function calculateEffectiveCapacity(inputs: CapacityInputs): number {
  requirePositiveInteger("templateCapacity", inputs.templateCapacity);

  const candidates = [inputs.templateCapacity];
  if (inputs.spaceCapacity != null) {
    requirePositiveInteger("spaceCapacity", inputs.spaceCapacity);
    candidates.push(inputs.spaceCapacity);
  }
  if (inputs.sessionCapacityOverride != null) {
    requirePositiveInteger(
      "sessionCapacityOverride",
      inputs.sessionCapacityOverride
    );
    candidates.push(inputs.sessionCapacityOverride);
  }

  return Math.min(...candidates);
}
