import {
  commercialLaunchProfile,
  getCommercialLaunchReadiness,
} from "@/lib/launch/commercial-launch-profile";

export function SellerIdentification() {
  const seller = commercialLaunchProfile;
  const { ready } = getCommercialLaunchReadiness();
  return (
    <section id="titular" aria-labelledby="seller-heading" className="mt-8 space-y-4 rounded-xl border border-border p-5 text-sm">
      <h2 id="seller-heading" className="text-lg font-semibold">Identificación de Zaltyko</h2>
      {!ready && (
        <p className="rounded-lg bg-muted p-3">
          Información legal en preparación. La contratación de pago todavía no está abierta.
        </p>
      )}
      <dl className="space-y-2">
        <div><dt className="font-medium">{seller.registrationStatus === "verified" ? "Titular" : "Promotor y futuro titular"}</dt><dd>{seller.legalName}</dd></div>
        <div><dt className="font-medium">País</dt><dd>España</dd></div>
        <div><dt className="font-medium">NIF</dt><dd>{seller.taxId ?? "Pendiente de completar"}</dd></div>
        <div><dt className="font-medium">Domicilio profesional</dt><dd>{seller.professionalAddress ?? "Pendiente de completar"}</dd></div>
        <div><dt className="font-medium">Contacto oficial</dt><dd><a className="underline" href={`mailto:${seller.supportEmail}`}>{seller.supportEmail}</a></dd></div>
      </dl>
    </section>
  );
}
