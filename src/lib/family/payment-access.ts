import { getFamilyChildrenForUser } from "@/lib/family/scope-service";
import { getConnectAccount, isConnectReady } from "@/lib/stripe/connect-service";

export interface FamilyPaymentAccess {
  allowed: boolean;
  reason?: string;
  stripeAccountId?: string;
  connectReady?: boolean;
}

/**
 * Autoriza a un usuario (padre/madre/tutor) a operar metodos de pago sobre una
 * academia concreta: debe tener al menos un hijo vinculado en esa academia, y la
 * academia debe tener Stripe Connect habilitado para cobros.
 */
export async function resolveFamilyPaymentAccess(params: {
  userId: string;
  email: string;
  academyId: string;
}): Promise<FamilyPaymentAccess> {
  const children = await getFamilyChildrenForUser({
    userId: params.userId,
    email: params.email,
  });

  const hasChildInAcademy = children.some((child) => child.academyId === params.academyId);
  if (!hasChildInAcademy) {
    return { allowed: false, reason: "NO_CHILD_IN_ACADEMY" };
  }

  const account = await getConnectAccount(params.academyId);
  if (!account) {
    return { allowed: true, reason: "CONNECT_NOT_CONNECTED", connectReady: false };
  }

  return {
    allowed: true,
    stripeAccountId: account.stripeAccountId,
    connectReady: isConnectReady(account),
  };
}
