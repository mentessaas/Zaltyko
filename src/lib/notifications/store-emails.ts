import { sendEmail } from "@/lib/brevo";

/**
 * Templates de email transaccional para tienda + marketplace.
 * Sprint T4.4: notificaciones al seller cuando llega una orden.
 */

function fmtPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
    cents / 100
  );
}

export async function notifySellerOfOrder(opts: {
  to: string;
  sellerAcademyName: string;
  buyerEmail: string;
  orderId: string;
  totalCents: number;
  commissionCents: number;
  netCents: number;
  currency: string;
  originUrl: string;
}) {
  await sendEmail({
    to: opts.to,
    subject: `Nueva orden en tu tienda — ${opts.orderId.slice(0, 8)}`,
    replyTo: "soporte@zaltyko.com",
    html: `
      <h2>Tienes una nueva venta</h2>
      <p>Academia: <strong>${opts.sellerAcademyName}</strong></p>
      <p>Comprador: <code>${opts.buyerEmail}</code></p>
      <p>Total: <strong>${fmtPrice(opts.totalCents, opts.currency)}</strong></p>
      <p>Comisión Zaltyko: ${fmtPrice(opts.commissionCents, opts.currency)}</p>
      <p>Recibes: <strong>${fmtPrice(opts.netCents, opts.currency)}</strong></p>
      <p><a href="${opts.originUrl}/marketplace/orders/${opts.orderId}">Ver orden</a></p>
    `,
    text: `Nueva orden ${opts.orderId} — ${opts.buyerEmail} — ${fmtPrice(
      opts.totalCents,
      opts.currency
    )} (recibes ${fmtPrice(opts.netCents, opts.currency)}).`,
  });
}

export async function notifySellerOfMarketplaceOrder(opts: {
  to: string;
  sellerAcademyName: string;
  buyerAcademyName: string;
  orderId: string;
  listingTitle: string;
  quantity: number;
  totalCents: number;
  commissionCents: number;
  netCents: number;
  currency: string;
  originUrl: string;
}) {
  await sendEmail({
    to: opts.to,
    subject: `Venta en marketplace — ${opts.listingTitle}`,
    replyTo: "soporte@zaltyko.com",
    html: `
      <h2>Has vendido en Zaltyko Marketplace</h2>
      <p>Tu academia <strong>${opts.sellerAcademyName}</strong> ha vendido
      <strong>${opts.quantity} × ${opts.listingTitle}</strong> a
      <strong>${opts.buyerAcademyName}</strong>.</p>
      <p>Total: ${fmtPrice(opts.totalCents, opts.currency)}</p>
      <p>Comisión Zaltyko: ${fmtPrice(opts.commissionCents, opts.currency)}</p>
      <p><strong>Recibes: ${fmtPrice(opts.netCents, opts.currency)}</strong></p>
      <p><a href="${opts.originUrl}/marketplace/orders/${opts.orderId}">Ver orden</a></p>
    `,
    text: `Venta marketplace ${opts.orderId} — ${opts.quantity} × ${opts.listingTitle} a ${opts.buyerAcademyName} — recibes ${fmtPrice(opts.netCents, opts.currency)}.`,
  });
}
