import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Testimonial {
  name: string;
  rating: number;
  text: string;
  role: string;
  avatar?: {
    src: string;
    initialsBg: string;
  };
}

const testimonials: Testimonial[] = [
  {
    name: "Carolina Torres",
    rating: 5,
    text: "Con Zaltyko migramos 3 sedes a un mismo panel. <span class='font-bold text-zaltyko-accent-light'>Los reportes diarios de asistencia</span> nos ahorran horas con los padres y la federación.",
    role: "Directora · Gravity Gym",
    avatar: {
      src: "https://images.unsplash.com/photo-1583413230540-7ddb76f1c9dc?auto=format&fit=facearea&facepad=3&w=160&h=160&q=80",
      initialsBg: "from-emerald-500/30 to-lime-400/30",
    },
  },
  {
    name: "Julián Andrade",
    rating: 4,
    text: "Activamos el plan Pro para 180 atletas. <span class='font-bold text-zaltyko-accent-light'>Los límites nos avisaron justo al llegar a 150</span> y el upgrade fue automático por Stripe.",
    role: "CFO · Escuela Olímpica Medellín",
    avatar: {
      src: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=3&w=160&h=160&q=80",
      initialsBg: "from-lime-500/30 to-emerald-400/30",
    },
  },
  {
    name: "María Fernanda Luna",
    rating: 5,
    text: "El módulo de eventos nos permitió coordinar la gira estatal. <span class='font-bold text-zaltyko-primary-light'>Coaches y padres reciben notificaciones</span> sin usar grupos de WhatsApp.",
    role: "Head Coach · Zenith Elite",
    avatar: {
      src: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=facearea&facepad=3&w=160&h=160&q=80",
      initialsBg: "from-sky-500/30 to-violet-400/30",
    },
  },
];

export default function TestimonialsPage() {
  return (
    <section id="clientes" className="bg-zaltyko-primary-dark px-4 py-20 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 text-center">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Equipos de alto rendimiento ya confían en Zaltyko
          </h2>
          <p className="mt-3 font-sans text-sm text-white/70">
            Historias reales de academias que coordinan cientos de atletas con nuestra plataforma.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card
              key={testimonial.name}
              className="flex h-full flex-col border border-white/10 bg-white/5 p-6"
            >
              <div className="flex-grow">
                <div className="mb-4 flex gap-1">
                  {[...Array(testimonial.rating)].map((_, index) => (
                    <Star
                      key={index}
                      className="h-4 w-4 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                </div>

                <p
                  className="mb-6 font-sans text-sm text-white/80"
                  dangerouslySetInnerHTML={{ __html: testimonial.text }}
                />
              </div>

              <div className="mt-auto flex items-center gap-3 border-t border-white/10 pt-4">
                <Avatar>
                  {testimonial.avatar && (
                    <AvatarImage
                      src={testimonial.avatar.src}
                      alt={testimonial.name}
                    />
                  )}
                  <AvatarFallback
                    className={`bg-gradient-to-br ${testimonial.avatar?.initialsBg ?? "from-zaltyko-primary-dark/50 to-zaltyko-primary/50"} text-xs font-semibold uppercase text-white`}
                  >
                    {testimonial.name
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {testimonial.name}
                  </h3>
                  <p className="font-sans text-xs uppercase tracking-wide text-white/60">
                    {testimonial.role}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
