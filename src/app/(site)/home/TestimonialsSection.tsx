import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Carolina Torres",
    role: "Directora",
    academy: "Gravity Gym Barcelona",
    text: "Zaltyko nos permitió unificar 3 sedes en un solo panel. La asistencia diaria se volvió automática y los reportes para padres son impecables. Ahorramos al menos 10 horas semanales en tareas administrativas.",
    rating: 5,
    avatar: "CT",
    color: "from-violet-500 to-purple-600",
  },
  {
    name: "Julián Andrade",
    role: "Director Financiero",
    academy: "Escuela Olímpica Medellín",
    text: "Migramos 180 atletas sin fricción. Cuando llegamos al límite del plan, el sistema nos guió al upgrade de forma transparente. La gestión de pagos y morosidad mejoró drásticamente.",
    rating: 5,
    avatar: "JA",
    color: "from-teal-500 to-emerald-600",
  },
  {
    name: "María Fernanda Luna",
    role: "Head Coach",
    academy: "Zenith Elite Madrid",
    text: "Organizamos la gira regional sin usar WhatsApp. Coaches y padres recibieron todas las notificaciones desde la plataforma. La coordinación de competiciones es ahora un proceso simple.",
    rating: 5,
    avatar: "ML",
    color: "from-amber-500 to-orange-600",
  },
];

export default function TestimonialsSection() {
  return (
    <section id="testimonios" className="py-20 lg:py-28 bg-zaltyko-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Testimonios reales
          </span>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl">
            Academias que ya transformaron su gestión
          </h2>
          <p className="mt-6 text-lg text-zaltyko-text-secondary leading-relaxed">
            Descubre cómo otros clubes de gimnasia artística, rítmica y acrobática 
            han simplificado sus operaciones con Zaltyko.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="relative bg-white rounded-2xl border border-zaltyko-border p-8 shadow-soft hover:shadow-medium transition-shadow duration-300"
            >
              {/* Quote icon */}
              <div className="absolute -top-4 left-8">
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center`}>
                  <Quote className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Rating */}
              <div className="flex gap-1 mb-4 pt-2">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-zaltyko-text-secondary leading-relaxed mb-6">
                &ldquo;{testimonial.text}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-4 pt-6 border-t border-zaltyko-border">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center text-white font-bold text-sm`}>
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="font-semibold text-zaltyko-text-main">{testimonial.name}</p>
                  <p className="text-sm text-zaltyko-text-secondary">
                    {testimonial.role} · {testimonial.academy}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-zaltyko-text-secondary">
            ¿Quieres ver más historias de éxito?{" "}
            <a href="mailto:hola@zaltyko.com" className="text-zaltyko-primary font-medium hover:underline">
              Contacta con nosotros
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

