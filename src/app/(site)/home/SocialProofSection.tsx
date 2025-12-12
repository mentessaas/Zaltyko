export default function SocialProofSection() {
  return (
    <section className="py-16 border-y border-zaltyko-border/50 bg-white/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-base font-medium text-zaltyko-text-secondary mb-8">
            Más academias están simplificando su gestión con Zaltyko
          </p>
          
          {/* Logo placeholders - para futuros logos de clientes */}
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center justify-center h-12 w-32 rounded-lg bg-zaltyko-bg border border-zaltyko-border/50"
              >
                <span className="text-sm text-zaltyko-text-light font-medium">
                  Academia {i}
                </span>
              </div>
            ))}
          </div>
          
          {/* Stats */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              { value: "+150", label: "Academias activas" },
              { value: "25,000+", label: "Atletas gestionados" },
              { value: "€4.2M", label: "Procesado en pagos" },
              { value: "98%", label: "Satisfacción" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-zaltyko-primary">{stat.value}</p>
                <p className="mt-1 text-sm text-zaltyko-text-secondary">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

