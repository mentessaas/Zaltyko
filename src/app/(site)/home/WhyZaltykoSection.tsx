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
    <section id="por-que-zaltyko" className="py-20 lg:py-28 bg-white relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-zaltyko-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="inline-block text-sm font-bold text-zaltyko-primary uppercase tracking-wider mb-4">
            Software especializado
          </span>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl">
            Por que un software especifico para gimnasi?
          </h2>
          <p className="mt-4 text-lg text-zaltyko-text-secondary">
            Los clubes de gimnasi tienen necesidades unicas que los sistemas genericos no cubren.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="grid md:grid-cols-2 gap-6 mb-16 max-w-4xl mx-auto">
          {/* Generic Software */}
          <div className="rounded-2xl border-2 border-red-200/50 bg-gradient-to-br from-red-50/50 to-white p-6 shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                <X className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg text-zaltyko-text-main">Software generico</h3>
            </div>
            <ul className="space-y-3">
              {comparison.generic.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zaltyko-text-secondary font-medium">
                  <div className="w-5 h-5 rounded-lg bg-red-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Zaltyko */}
          <div className="rounded-2xl border-2 border-zaltyko-primary/20 bg-gradient-to-br from-zaltyko-primary/5 to-white p-6 shadow-lg hover:shadow-xl hover:shadow-zaltyko-primary/10 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center shadow-lg shadow-zaltyko-primary/20">
                <Check className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-lg text-zaltyko-text-main">Zaltyko</h3>
            </div>
            <ul className="space-y-3">
              {comparison.zaltyko.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zaltyko-text-secondary font-medium">
                  <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center mt-0.5 flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
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
              className="group text-center p-5 rounded-2xl bg-gradient-to-br from-zaltyko-bg/50 to-white border border-zaltyko-border/30 hover:border-zaltyko-primary/40 hover:bg-white hover:shadow-xl hover:shadow-zaltyko-primary/10 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-zaltyko-primary/20 to-zaltyko-primary/5 flex items-center justify-center text-zaltyko-primary group-hover:from-zaltyko-primary group-hover:to-zaltyko-primary-dark group-hover:text-white transition-all duration-300 shadow-lg group-hover:shadow-zaltyko-primary/30 group-hover:scale-110 mb-3">
                <benefit.icon className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-sm text-zaltyko-text-main mb-1 group-hover:text-zaltyko-primary transition-colors">
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
