import { db } from "@/db";
import { charges, athletes, familyContacts } from "@/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { createNotification } from "@/lib/notifications/notification-service";
import { subDays } from "date-fns";

export interface PaymentAlert {
  chargeId: string;
  athleteId: string;
  athleteName: string;
  amount: number;
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
        dueDate: charges.dueDate,
      })
      .from(charges)
      .innerJoin(athletes, eq(charges.athleteId, athletes.id))
      .where(
        and(
          eq(charges.academyId, academyId),
          eq(charges.tenantId, tenantId),
          eq(charges.status, "pending"),
          lte(charges.dueDate, cutoffDate.toISOString().split("T")[0])
        )
      );

    const alerts: PaymentAlert[] = [];

    for (const charge of overdueCharges) {
      // Obtener contactos de familia
      const contacts = await db
        .select({ contactId: familyContacts.id })
        .from(familyContacts)
        .where(eq(familyContacts.athleteId, charge.athleteId));

      const daysOverdueValue = Math.floor(
        (today.getTime() - (charge.dueDate ? new Date(charge.dueDate).getTime() : today.getTime())) /
        (1000 * 60 * 60 * 24)
      );

      alerts.push({
        chargeId: charge.chargeId,
        athleteId: charge.athleteId,
        athleteName: charge.athleteName || "Sin nombre",
        amount: Number(charge.amountCents) / 100,
        dueDate: charge.dueDate ? new Date(charge.dueDate) : today,
        daysOverdue: daysOverdueValue,
        parentContactIds: contacts.map((c) => c.contactId),
      });
    }

    return alerts;
  } catch (error) {
    console.error("Error detecting payment alerts:", error);
    return [];
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
        message: `El pago de ${alert.amount.toFixed(2)} € está ${alert.daysOverdue} días atrasado.`,
        data: {
          chargeId: alert.chargeId,
          athleteId: alert.athleteId,
          amount: alert.amount,
          daysOverdue: alert.daysOverdue,
        },
      });
    }

    // TODO: Enviar email a padres usando el servicio de email
  }
}

