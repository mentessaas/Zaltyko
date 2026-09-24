import { db } from "@/db";
import { charges, athletes, familyContacts } from "@/db/schema";
import { eq, and, lte, isNull } from "drizzle-orm";
import { createNotification } from "@/lib/notifications/notification-service";
import { subDays } from "date-fns";
import { logger } from "@/lib/logger";
import { formatCurrency } from "@/lib/currency";

export interface PaymentAlert {
  chargeId: string;
  athleteId: string;
  athleteName: string;
  amount: number;
  currency: string;
  dueDate: Date;
  daysOverdue: number;
  parentContactIds: string[];
}

/**
 * Detecta pagos atrasados
 */
export async function detectPaymentAlerts(
  academyId: string,
  tenantId: string,
  daysOverdue: number = 7
): Promise<PaymentAlert[]> {
  try {
    const today = new Date();
    const cutoffDate = subDays(today, daysOverdue);

    const overdueCharges = await db
      .select({
        chargeId: charges.id,
        athleteId: charges.athleteId,
        athleteName: athletes.name,
        amountCents: charges.amountCents,
        currency: charges.currency,
        dueDate: charges.dueDate,
      })
      .from(charges)
      .innerJoin(athletes, eq(charges.athleteId, athletes.id))
      .where(
        and(
          eq(charges.academyId, academyId),
          eq(charges.tenantId, tenantId),
          eq(charges.status, "pending"),
          eq(athletes.status, "active"),
          isNull(athletes.deletedAt),
          lte(charges.dueDate, cutoffDate.toISOString().split("T")[0])
        )
      )
      .limit(10000);

    const alerts: PaymentAlert[] = [];

    for (const charge of overdueCharges) {
      // Obtener contactos de familia
      const contacts = await db
        .select({ contactId: familyContacts.id })
        .from(familyContacts)
        .where(and(eq(familyContacts.athleteId, charge.athleteId), eq(familyContacts.tenantId, tenantId)))
        .limit(100);

      const daysOverdueValue = Math.floor(
        (today.getTime() - (charge.dueDate ? new Date(charge.dueDate).getTime() : today.getTime())) /
        (1000 * 60 * 60 * 24)
      );

      alerts.push({
        chargeId: charge.chargeId,
        athleteId: charge.athleteId,
        athleteName: charge.athleteName || "Sin nombre",
        amount: Number(charge.amountCents) / 100,
        currency: charge.currency ?? "EUR",
        dueDate: charge.dueDate ? new Date(charge.dueDate) : today,
        daysOverdue: daysOverdueValue,
        parentContactIds: contacts.map((c) => c.contactId),
      });
    }

    return alerts;
  } catch (error) {
    logger.error("Error detecting payment alerts:", error);
    throw error;
  }
}

/**
 * Crea notificaciones para alertas de pagos
 */
export async function createPaymentNotifications(
  academyId: string,
  tenantId: string,
  adminUserIds: string[]
) {
  const alerts = await detectPaymentAlerts(academyId, tenantId);

  // Validar que alerts sea un array
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return;
  }

  for (const alert of alerts) {
    // Notificar a administradores
    for (const userId of adminUserIds) {
      await createNotification({
        tenantId,
        userId,
        type: "payment_overdue",
        title: `Pago atrasado: ${alert.athleteName}`,
        message: `El pago de ${formatCurrency(alert.amount, alert.currency)} está ${alert.daysOverdue} días atrasado.`,
        data: {
          chargeId: alert.chargeId,
          athleteId: alert.athleteId,
          amount: alert.amount,
          currency: alert.currency,
          daysOverdue: alert.daysOverdue,
        },
      });
    }

    // El envío de emails vive en `triggerScheduledPaymentReminders`, que
    // aplica ventanas y deduplicación por cargo. Este job se limita a alertas
    // internas para no duplicar comunicaciones a las familias.
  }
}
