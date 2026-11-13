import {
  commercialLaunchProfile,
  getCommercialLaunchReadiness,
  type CommercialLaunchProfile,
} from "@/lib/launch/commercial-launch-profile";

// Panel reglado (cinta blanca, borde de magnesio y regla de 3 px en noche) con
// los datos del titular en filas regladas: rótulo a la izquierda, dato a la
// derecha. El aviso de «en preparación» va en polvo, no en coral: no es error.
const ROW = "grid gap-1 border-t border-chalk-line px-5 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4";

/**
 * Identificación del prestador (LSSI art. 10) en Términos y Privacidad: lee
 * siempre el perfil único, así el NIF y el domicilio aparecen en cuanto se
 * completan en src/lib/launch/commercial-launch-profile.ts.
 */
export function SellerIdentification({
  profile = commercialLaunchProfile,
}: { profile?: Readonly<CommercialLaunchProfile> } = {}) {
  const seller = profile;
  const { ready } = getCommercialLaunchReadiness(profile);
  return (
    <section
      id="titular"
      aria-labelledby="seller-heading"
      className="scroll-mt-24 rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white text-sm"
    >
      <h2
        id="seller-heading"
        className="font-display px-5 pb-4 pt-5 text-2xl font-black uppercase leading-none text-mat-night"
      >
        Identificación de Zaltyko
      </h2>
      {!ready && (
        <p className="mx-5 mb-4 rounded-md bg-chalk-dust px-4 py-3 text-ramp-600">
          Información legal en preparación. La contratación de pago todavía no está abierta.
        </p>
      )}
      <dl>
        <div className={ROW}><dt className="font-semibold text-mat-night">{seller.registrationStatus === "verified" ? "Titular" : "Promotor y futuro titular"}</dt><dd className="text-ramp-600">{seller.legalName}</dd></div>
        <div className={ROW}><dt className="font-semibold text-mat-night">País</dt><dd className="text-ramp-600">España</dd></div>
        <div className={ROW}><dt className="font-semibold text-mat-night">NIF</dt><dd className="text-ramp-600">{seller.taxId ?? "Pendiente de completar"}</dd></div>
        <div className={ROW}><dt className="font-semibold text-mat-night">Domicilio profesional</dt><dd className="text-ramp-600">{seller.professionalAddress ?? "Pendiente de completar"}</dd></div>
        <div className={ROW}><dt className="font-semibold text-mat-night">Contacto oficial</dt><dd><a className="font-semibold text-mat underline decoration-2 underline-offset-4" href={`mailto:${seller.supportEmail}`}>{seller.supportEmail}</a></dd></div>
      </dl>
    </section>
  );
}
