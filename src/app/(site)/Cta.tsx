export default function CTA() {
  return (
    <section className="relative overflow-hidden bg-zaltyko-primary-dark px-4 py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,_rgba(66,165,245,0.15),_transparent_65%)]" />
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">
          ¿Listo para centralizar tu academia de gimnasia?
        </h2>
        <p className="mt-4 font-sans text-base text-white/80">
          Activa el modo demo, carga atletas ficticios y prueba el flujo completo de onboarding, límites por plan y facturación sin introducir tarjetas reales.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/onboarding"
            className="rounded-full bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light px-6 py-3 text-sm font-semibold text-zaltyko-primary-dark transition hover:from-zaltyko-accent-light hover:to-zaltyko-accent"
          >
            Iniciar demo guiada
          </a>
          <a
            href="mailto:hola@zaltyko.com"
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            Agendar demo personalizada
          </a>
        </div>
      </div>
    </section>
  );
}
