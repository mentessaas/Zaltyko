import { AppError } from "@/lib/errors";
import type { CommercialPlanCode, PlanCode } from "@/types/billing";

export type { PlanCode };
export type UpgradePlanCode = Exclude<CommercialPlanCode, "free">;
export type LimitResource = "athletes" | "classes" | "groups" | "academies";

export interface LimitErrorPayload {
  code: "LIMIT_REACHED";
  upgradeTo?: UpgradePlanCode;
  resource: LimitResource;
  currentCount: number;
  limit: number;
}

/**
 * Error lanzado cuando se alcanza un límite de plan
 */
export class LimitError extends AppError {
  constructor(
    message: string,
    public readonly payload: LimitErrorPayload
  ) {
    super(message, "LIMIT_REACHED", 402);
    this.name = "LimitError";
  }
}
