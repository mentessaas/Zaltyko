import { z } from "zod";

export const enrollmentStatusSchema = z.enum([
  "pending",
  "trial",
  "active",
  "paused",
  "cancelled",
  "completed",
]);

export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

const allowedTransitions: Readonly<
  Record<EnrollmentStatus, readonly EnrollmentStatus[]>
> = {
  pending: ["trial", "active", "cancelled"],
  trial: ["active", "cancelled", "completed"],
  active: ["paused", "cancelled", "completed"],
  paused: ["active", "cancelled", "completed"],
  cancelled: [],
  completed: [],
};

export function canTransitionEnrollment(
  from: EnrollmentStatus,
  to: EnrollmentStatus
): boolean {
  return allowedTransitions[from].includes(to);
}

export const enrollmentMutationSchema = z.object({
  organizationId: z.guid(),
  enrollmentId: z.guid(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const transferEnrollmentSchema = enrollmentMutationSchema.extend({
  targetLocationId: z.guid(),
  targetClassTemplateId: z.guid(),
  startsOn: z.string().date(),
  sourceStatus: enrollmentStatusSchema.refine(
    (status) =>
      status === "trial" || status === "active" || status === "paused",
    "Solo una inscripción abierta puede transferirse"
  ),
});

export type EnrollmentMutation = z.infer<typeof enrollmentMutationSchema>;
export type TransferEnrollment = z.infer<typeof transferEnrollmentSchema>;
