import type { getOwnerEnrollmentsPageData } from "@/modules/enrollments/application/enrollment-query-service";

export type EnrollmentBundle = Awaited<
  ReturnType<typeof getOwnerEnrollmentsPageData>
> & { filterLocationId: string | null };

export type Candidate = { id: string; name: string };

export type PricePlanOption = {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  cadence: string;
};

export type StatusFilter =
  | "all"
  | "pending"
  | "trial"
  | "active"
  | "paused"
  | "cancelled"
  | "completed";

export type ChangeableStatus = "active" | "paused" | "cancelled" | "completed";
