import Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, profiles, subscriptions } from "@/db/schema";
import { extractMetadataValue } from "@/lib/stripe/metadata-utils";
import { getStripeClient } from "@/lib/stripe/client";

export interface AcademyContext {
  academyId: string | null;
  tenantId: string | null;
  userId: string | null;
}

/**
 * Resuelve el contexto de academia desde un ID
 */
export async function resolveAcademyContext(
  academyId: string | null | undefined
): Promise<{ academyId: string | null; tenantId: string | null }> {
  if (!academyId) {
    return { academyId: null, tenantId: null };
  }

  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  return {
    academyId,
    tenantId: academy?.tenantId ?? null,
  };
}

/**
 * Obtiene el contexto de academia desde los metadatos de una suscripción
 */
export async function getAcademyContextFromSubscription(
  subscription: Stripe.Subscription
): Promise<AcademyContext> {
  const metadata = subscription.metadata;
  const userId =
    extractMetadataValue(metadata, "userId") ??
    extractMetadataValue(metadata, "user_id") ??
    null;

  const academyId =
    extractMetadataValue(metadata, "academyId") ??
    extractMetadataValue(metadata, "academy_id") ??
    null;

  const tenantId =
    extractMetadataValue(metadata, "tenantId") ??
    extractMetadataValue(metadata, "tenant_id") ??
    null;

  // Si tenemos userId, intentar obtener academia del owner
  if (userId) {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (profile) {
      const [academy] = await db
        .select({ id: academies.id, tenantId: academies.tenantId })
        .from(academies)
        .where(eq(academies.ownerId, profile.id))
        .limit(1);

      if (academy) {
        return { academyId: academy.id, tenantId: academy.tenantId, userId };
      }
    }
  }

  // Si tenemos academyId, resolver tenantId si falta
  if (academyId) {
    if (tenantId) {
      return { academyId, tenantId, userId };
    }
    const context = await resolveAcademyContext(academyId);
    return { ...context, userId };
  }

  return { academyId: null, tenantId: null, userId };
}

/**
 * Obtiene el contexto de academia desde una factura de Stripe
 */
export async function getAcademyContextFromInvoice(
  invoice: Stripe.Invoice,
  stripe: Stripe
): Promise<AcademyContext> {
  const metadata = invoice.metadata;
  let userId =
    extractMetadataValue(metadata, "userId") ??
    extractMetadataValue(metadata, "user_id") ??
    null;

  let academyId =
    extractMetadataValue(metadata, "academyId") ??
    extractMetadataValue(metadata, "academy_id") ??
    null;

  let tenantId =
    extractMetadataValue(metadata, "tenantId") ??
    extractMetadataValue(metadata, "tenant_id") ??
    null;

  // Si ya tenemos toda la información, retornar
  if (academyId && tenantId) {
    return { academyId, tenantId, userId };
  }

  // Intentar obtener desde la suscripción asociada
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  if (subscriptionId) {
    // Primero intentar desde la base de datos
    const [subscriptionRow] = await db
      .select({
        userId: subscriptions.userId,
      })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);

    if (subscriptionRow?.userId) {
      userId = subscriptionRow.userId;
      const [profile] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.userId, subscriptionRow.userId))
        .limit(1);

      if (profile) {
        const [academy] = await db
          .select({ id: academies.id, tenantId: academies.tenantId })
          .from(academies)
          .where(eq(academies.ownerId, profile.id))
          .limit(1);

        if (academy) {
          academyId = academy.id;
          tenantId = academy.tenantId;
        }
      }
    } else {
      // Si no está en la DB, obtener desde Stripe
      const remoteSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      const meta = remoteSubscription.metadata;
      
      userId =
        userId ??
        extractMetadataValue(meta, "userId") ??
        extractMetadataValue(meta, "user_id") ??
        null;

      academyId =
        academyId ??
        extractMetadataValue(meta, "academyId") ??
        extractMetadataValue(meta, "academy_id") ??
        null;

      tenantId =
        tenantId ??
        extractMetadataValue(meta, "tenantId") ??
        extractMetadataValue(meta, "tenant_id") ??
        null;

      // Si tenemos userId pero no academyId, buscar academia del owner
      if (userId && !academyId) {
        const [profile] = await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1);

        if (profile) {
          const [academy] = await db
            .select({ id: academies.id, tenantId: academies.tenantId })
            .from(academies)
            .where(eq(academies.ownerId, profile.id))
            .limit(1);

          if (academy) {
            academyId = academy.id;
            tenantId = academy.tenantId;
          }
        }
      }
    }
  }

  // Si tenemos academyId pero no tenantId, resolverlo
  if (academyId && !tenantId) {
    const context = await resolveAcademyContext(academyId);
    tenantId = context.tenantId;
  }

  return { academyId, tenantId, userId };
}

