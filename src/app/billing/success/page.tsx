import { redirect } from "next/navigation";

interface BillingSuccessPageProps {
  searchParams: Promise<{
    academy?: string | string[];
  }>;
}

/**
 * Compatibilidad con sesiones de Checkout creadas antes del retorno al panel
 * de la academia. La activación real de la suscripción sigue ocurriendo en
 * los webhooks de Stripe; esta página solo normaliza el destino de retorno.
 */
export default async function BillingSuccessPage({ searchParams }: BillingSuccessPageProps) {
  const params = await searchParams;
  const academy = Array.isArray(params.academy) ? params.academy[0] : params.academy;
  const query = new URLSearchParams({ checkout: "success" });

  if (academy) {
    query.set("academy", academy);
  }

  redirect(`/billing?${query.toString()}`);
}
