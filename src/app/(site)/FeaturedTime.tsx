import { Users, Calendar, UserCog, ClipboardCheck, CreditCard, LayoutDashboard } from "lucide-react";

const features = [
  {
    title: "Atletas",
    description:
      "Fichas completas, contactos de padres, niveles, importación desde Excel.",
    icon: Users,
  },
  {
    title: "Grupos y clases",
    description:
      "Grupos por nivel/edad, horarios, calendario semanal/mensual, sesiones automáticas.",
    icon: Calendar,
  },
  {
    title: "Entrenadores",
    description:
      "Acceso solo a sus grupos, asistencia sencilla, clases del día.",
    icon: UserCog,
  },
  {
    title: "Asistencia",
    description:
      "Presente/ausente/tarde, % por grupo, métricas en dashboard.",
    icon: ClipboardCheck,
  },
  {
    title: "Pagos",
    description:
      "Control mensual básico, marca quién pagó, límites automáticos por plan.",
    icon: CreditCard,
  },
  {
    title: "Dashboard",
    description:
      "Atletas activos, grupos, próximas clases, asistencia últimos días.",
    icon: LayoutDashboard,
  },
];

export default function FeaturedTime() {
  return (
    <section id="caracteristicas" className="py-20">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <span className="font-display text-xs uppercase tracking-[0.35em] text-zaltyko-accent">
          Todo en un solo lugar
        </span>
        <h2 className="mt-4 font-display text-3xl font-bold text-foreground sm:text-4xl">
          Zaltyko combina operativa diaria, comunicación interna y control financiero en una sola plataforma.
        </h2>
        <p className="mt-4 font-sans text-base text-muted-foreground">
          Sin Excel. Sin caos. Sin WhatsApp. Todo lo que necesitas para gestionar tu academia de gimnasia profesionalmente.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-border bg-card p-6 text-left shadow-lg"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zaltyko-accent/20 text-zaltyko-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-6 font-display text-xl font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
