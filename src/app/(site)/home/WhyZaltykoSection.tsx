import { Target, Shield, Zap, Users, TrendingUp, Clock, X, Check } from "lucide-react";

const benefits = [
  {
    icon: Target,
    title: "Diseñado para gimnasia",
    description: "Funcionalidades específicas para gimnasia artística, rítmica y acrobática.",
  },
  {
    icon: Shield,
    title: "Datos seguros",
    description: "Cada academia tiene sus datos completamente separados y protegidos.",
  },
  {
    icon: Zap,
    title: "Automatización",
    description: "Cobros, recordatorios y reportes de forma automática.",
  },
  {
    icon: Users,
    title: "Para todo el equipo",
    description: "Roles para propietarios, coaches, staff y padres.",
  },
  {
    icon: TrendingUp,
    title: "Escala sin límites",
    description: "Desde 30 atletas hasta redes de sedes múltiples.",
  },
  {
    icon: Clock,
    title: "Ahorra 15h/semana",
    description: "Reduce drásticamente el trabajo administrativo.",
  },
];

const comparison = {
  generic: [
    "Pensado para gimnasios fitness",
    "Sin gestión de niveles técnicos",
    "Sin inscripciones a competiciones",
    "Comunicación básica",
    "Sin seguimiento de aparatos",
  ],
  zaltyko: [
    "Diseñado para gimnasia artística, rítmica y acrobática",
    "Gestión de niveles y categorías de competición",
    "Inscripciones a eventos con un clic",
    "Portal para familias y notificaciones",
    "Historial completo por atleta y aparato",
  ],
};

export default function WhyZaltykoSection() {
  return (
    <section id="por-que-zaltyko" className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Software especializado
          </span>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl">
            ¿Por qué un software específico para gimnasia?
          </h2>
          <p className="mt-4 text-lg text-zaltyko-text-secondary">
            Los clubes de gimnasia tienen necesidades únicas que los sistemas genéricos no cubren.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="grid md:grid-cols-2 gap-6 mb-16 max-w-4xl mx-auto">
          {/* Generic Software */}
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="font-semibold text-zaltyko-text-main">Software genérico</h3>
            </div>
            <ul className="space-y-3">
              {comparison.generic.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zaltyko-text-secondary">
                  <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Zaltyko */}
          <div className="rounded-2xl border border-zaltyko-primary/20 bg-zaltyko-primary/5 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-zaltyko-primary/20 flex items-center justify-center">
                <Check className="w-5 h-5 text-zaltyko-primary" />
              </div>
              <h3 className="font-semibold text-zaltyko-text-main">Zaltyko</h3>
            </div>
            <ul className="space-y-3">
              {comparison.zaltyko.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zaltyko-text-secondary">
                  <Check className="w-4 h-4 text-zaltyko-primary mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="group text-center p-4 rounded-xl bg-zaltyko-bg/50 border border-zaltyko-border hover:border-zaltyko-primary/30 hover:bg-white transition-all duration-300"
            >
              <div className="w-12 h-12 mx-auto rounded-xl bg-zaltyko-primary/10 flex items-center justify-center text-zaltyko-primary group-hover:bg-zaltyko-primary group-hover:text-white transition-colors duration-300 mb-3">
                <benefit.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-sm text-zaltyko-text-main mb-1">
                {benefit.title}
              </h3>
              <p className="text-xs text-zaltyko-text-secondary leading-relaxed">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
