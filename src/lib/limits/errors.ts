import { AppError } from "@/lib/errors";

export type PlanCode = "free" | "pro" | "premium";
export type LimitResource = "athletes" | "classes" | "groups" | "academies";

export interface LimitErrorPayload {
  code: "LIMIT_REACHED";
  upgradeTo?: Exclude<PlanCode, "premium"> | "premium";
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

