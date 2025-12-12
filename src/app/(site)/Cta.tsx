export default function CTA() {
  return (
    <section className="relative overflow-hidden px-4 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
          ¿Listo para organizar tu academia sin caos?
        </h2>
        <p className="mt-4 font-sans text-base text-muted-foreground">
          Activa el modo demo, carga atletas ficticios y prueba todo: onboarding, asistencia, dashboard, límites y facturación sin tarjeta.
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
            className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Agendar demo personalizada
          </a>
        </div>
      </div>
    </section>
  );
}
