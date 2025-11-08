import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const testimonials = [
  {
    name: "Carolina Torres",
    rating: 5,
    text: "Con GymnaSaaS migramos 3 sedes a un mismo panel. <span class='font-bold text-emerald-300'>Los reportes diarios de asistencia</span> nos ahorran horas con los padres y la federación.",
    role: "Directora · Gravity Gym",
    avatar: "/avatars/demo-coach-1.jpg",
  },
  {
    name: "Julián Andrade",
    rating: 4,
    text: "Activamos el plan Pro para 180 atletas. <span class='font-bold text-lime-300'>Los límites nos avisaron justo al llegar a 150</span> y el upgrade fue automático por Stripe.",
    role: "CFO · Escuela Olímpica Medellín",
    avatar: "/avatars/demo-coach-2.jpg",
  },
  {
    name: "María Fernanda Luna",
    rating: 5,
    text: "El módulo de eventos nos permitió coordinar la gira estatal. <span class='font-bold text-sky-300'>Coaches y padres reciben notificaciones</span> sin usar grupos de WhatsApp.",
    role: "Head Coach · Zenith Elite",
    avatar: "/avatars/demo-coach-3.jpg",
  },
];

export default function TestimonialsPage() {

  return (
    <section id="clientes" className="bg-[#0b1417] py-20 px-4 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            Equipos de alto rendimiento ya confían en GymnaSaaS
          </h2>
          <p className="mt-3 text-sm text-slate-200/70">
            Historias reales de academias que coordinan cientos de atletas con nuestra plataforma.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="flex h-full flex-col border border-white/10 bg-white/5 p-6"
            >
              <div className="flex-grow">
                {testimonial.rating && (
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={i}
                        className="w-4 h-4 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                )}

                <p
                  className="mb-6 text-sm text-slate-200/80"
                  dangerouslySetInnerHTML={{ __html: testimonial.text }}
                />
              </div>

              <div className="mt-auto flex items-center gap-3 border-t border-white/10 pt-4">
                <Avatar>
                  <AvatarImage
                    src={testimonial.avatar}
                    alt={testimonial.name}
                  />
                  <AvatarFallback>
                    {testimonial.name.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {testimonial.name}
                  </h3>
                  <p className="text-xs uppercase tracking-wide text-slate-300/60">
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
