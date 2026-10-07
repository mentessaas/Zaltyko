import {
  CalendarDays,
  CircleDollarSign,
  MessagesSquare,
  Search,
} from "lucide-react";
import Reveal from "@/components/motion/Reveal";

const dailyPressures = [
  {
    icon: Search,
    pain: "La información está repartida",
    title: "Encuentra cada dato donde lo necesitas",
    description:
      "Reúne fichas de gimnastas, grupos y datos de familia en el espacio de tu academia.",
    result: "Menos búsquedas y menos tareas repetidas.",
  },
  {
    icon: CircleDollarSign,
    pain: "Las cuotas piden seguimiento",
    title: "Ten más claro qué se ha cobrado",
    description:
      "Consulta cuotas, pagos y recibos; activa cobros recurrentes según el plan de tu academia.",
    result: "Más contexto para revisar los cobros y actuar.",
  },
  {
    icon: CalendarDays,
    pain: "Grupos y horarios cambian",
    title: "Llega a cada sesión con la lista a mano",
    description:
      "Organiza clases y grupos, y registra la asistencia sesión por sesión desde el móvil.",
    result: "Sabes qué ocurre en cada clase.",
  },
  {
    icon: MessagesSquare,
    pain: "Las familias preguntan lo mismo por varios canales",
    title: "Comparte la información importante",
    description:
      "Organiza avisos y comunicación interna; las familias acceden a horarios, cuotas y progreso publicado según su portal.",
    result: "Una experiencia más clara para las familias.",
  },
];

export default function SocialProofSection() {
  return (
    <section className="border-y border-zaltyko-mist/80 bg-white py-20 dark:border-border dark:bg-zaltyko-bg-dark sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-zaltyko-teal dark:text-zaltyko-lime">
              El día a día de quien dirige
            </p>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-zaltyko-navy dark:text-foreground sm:text-5xl">
              Menos fuegos administrativos. Más tiempo para la gimnasia.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zaltyko-text-secondary dark:text-muted-foreground sm:text-lg">
              Cuando los datos, las cuotas y las clases se entienden entre sí,
              puedes dedicar menos atención a perseguir información y más a
              dirigir tu academia.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {dailyPressures.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.pain} delay={index * 70}>
                <article className="h-full rounded-2xl border border-zaltyko-mist/80 bg-zaltyko-white p-6 transition duration-200 hover:-translate-y-1 hover:border-zaltyko-teal/40 hover:shadow-soft dark:border-border dark:bg-card dark:hover:border-zaltyko-lime/40">
                  <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-zaltyko-teal/10 text-zaltyko-teal dark:bg-zaltyko-lime/10 dark:text-zaltyko-lime">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zaltyko-text-light dark:text-muted-foreground">
                    {item.pain}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-bold leading-snug text-zaltyko-navy dark:text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-zaltyko-text-secondary dark:text-muted-foreground">
                    {item.description}
                  </p>
                  <p className="mt-5 border-t border-zaltyko-mist/80 pt-4 text-sm font-semibold leading-6 text-zaltyko-teal dark:border-border dark:text-zaltyko-lime">
                    {item.result}
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
