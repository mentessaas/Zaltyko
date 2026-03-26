/**
 * Cron job to process scheduled notifications
 * Should run every minute
 */

import { NextResponse } from "next/server";
import { getPendingScheduledNotifications, markScheduledNotificationSent } from "@/lib/communication-service";
import { createNotification } from "@/lib/notifications/notification-service";

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    // Get pending notifications that are due
    const pendingNotifications = await getPendingScheduledNotifications(new Date());

    let sentCount = 0;
    let failedCount = 0;

    for (const notification of pendingNotifications) {
      try {
        // Create actual in-app notification
        await createNotification({
          tenantId: notification.academyId,
          userId: notification.userId!,
          type: notification.type,
          title: notification.title,
          message: notification.message || undefined,
          data: notification.data || undefined,
        });

        // Mark as sent
        await markScheduledNotificationSent(notification.id);
        sentCount++;
      } catch (error) {
        console.error(`Error sending scheduled notification ${notification.id}:`, error);
        await markScheduledNotificationSent(notification.id, String(error));
        failedCount++;
      }
    }

    return NextResponse.json({
      processed: pendingNotifications.length,
      sent: sentCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error("Error processing scheduled notifications:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
