import { createCapacityNotifications } from "@/lib/alerts/capacity-alerts";
import { createPaymentNotifications } from "@/lib/alerts/payment-alerts";
import { createAttendanceNotifications } from "@/lib/alerts/attendance/createAttendanceNotifications";
import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";

type NotificationRecipients = {
  adminProfileIds: Set<string>;
  coachProfileIds: Set<string>;
};

function addRecipient(
  recipientsByAcademy: Map<string, NotificationRecipients>,
  academyId: string,
  profileId: string,
  role: string | null,
  membershipRole?: string | null
) {
  const recipients = recipientsByAcademy.get(academyId) ?? {
    adminProfileIds: new Set<string>(),
    coachProfileIds: new Set<string>(),
  };

  // An owner remains an admin recipient even if they also coach a class.
  if (role === "coach" && membershipRole !== "owner") {
    recipients.coachProfileIds.add(profileId);
  } else {
    recipients.adminProfileIds.add(profileId);
  }
  recipientsByAcademy.set(academyId, recipients);
}

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:daily-alerts", async () => {
      // Only operational academies receive automated notifications.
      const allAcademies = await db
        .select({
          id: academies.id,
          tenantId: academies.tenantId,
          ownerId: academies.ownerId,
        })
        .from(academies)
        .where(
          and(
            eq(academies.isSuspended, false),
            inArray(academies.status, ["active", "trial"])
          )
        );

      const results = {
        capacityAlerts: 0,
        paymentAlerts: 0,
        attendanceAlerts: 0,
      };

      if (allAcademies.length === 0) {
        return { ok: true, message: "No hay academias activas", academiesProcessed: 0, results };
      }

      const academyIds = allAcademies.map((academy) => academy.id);
      const [membershipProfiles, ownerProfiles] = await Promise.all([
        db
          .select({
            academyId: memberships.academyId,
            profileId: profiles.id,
            role: profiles.role,
            membershipRole: memberships.role,
          })
          .from(memberships)
          .innerJoin(profiles, eq(memberships.userId, profiles.userId))
          .where(
            and(
              inArray(memberships.academyId, academyIds),
              inArray(profiles.role, ["owner", "admin", "super_admin", "coach"]),
              eq(profiles.isSuspended, false),
              eq(profiles.canLogin, true)
            )
          ),
        // Owners are the canonical admin recipient even when legacy data has no
        // corresponding membership row.
        db
          .select({
            academyId: academies.id,
            profileId: profiles.id,
            role: profiles.role,
          })
          .from(academies)
          .innerJoin(profiles, eq(academies.ownerId, profiles.id))
          .where(
            and(
              inArray(academies.id, academyIds),
              eq(profiles.isSuspended, false),
              eq(profiles.canLogin, true)
            )
          ),
      ]);

      const recipientsByAcademy = new Map<string, NotificationRecipients>();
      for (const profile of membershipProfiles) {
        addRecipient(
          recipientsByAcademy,
          profile.academyId,
          profile.profileId,
          profile.role,
          profile.membershipRole
        );
      }
      for (const owner of ownerProfiles) {
        addRecipient(recipientsByAcademy, owner.academyId, owner.profileId, owner.role, "owner");
      }

      for (const academy of allAcademies) {
        try {
          const recipients = recipientsByAcademy.get(academy.id);
          const adminProfileIds = [...(recipients?.adminProfileIds ?? [])];
          const coachProfileIds = [...(recipients?.coachProfileIds ?? [])];

          try {
            await createCapacityNotifications(academy.id, academy.tenantId, adminProfileIds);
            results.capacityAlerts++;
          } catch (error) {
            logger.error(
              `Error creating capacity alerts for academy ${academy.id}`,
              error,
              { academyId: academy.id }
            );
          }

          try {
            await createPaymentNotifications(academy.id, academy.tenantId, adminProfileIds);
            results.paymentAlerts++;
          } catch (error) {
            logger.error(
              `Error creating payment alerts for academy ${academy.id}`,
              error,
              { academyId: academy.id }
            );
          }

          try {
            await createAttendanceNotifications(
              academy.id,
              academy.tenantId,
              adminProfileIds,
              coachProfileIds
            );
            results.attendanceAlerts++;
          } catch (error) {
            logger.error(
              `Error creating attendance alerts for academy ${academy.id}`,
              error,
              { academyId: academy.id }
            );
          }
        } catch (error) {
          logger.error(
            `Error processing alerts for academy ${academy.id}`,
            error,
            { academyId: academy.id }
          );
          // Continue with the next academy.
        }
      }

      return {
        ok: true,
        message: "Daily alerts processed successfully",
        academiesProcessed: allAcademies.length,
        results,
      };
    });

    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }

    return apiSuccess(execution.value);
  } catch (error: unknown) {
    logger.error("Error in daily alerts cron", error);
    return apiError("CRON_FAILED", "Cron job failed", 500);
  }
}
