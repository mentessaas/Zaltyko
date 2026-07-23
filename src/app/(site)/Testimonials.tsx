import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Testimonial {
  title: string;
  text: string;
}

const proofPoints: Testimonial[] = [
  {
    title: "Una operación conectada",
    text: "Centraliza gimnastas, grupos, asistencia, cobros y comunicación para que el equipo trabaje con la misma información.",
  },
  {
    title: "Puesta en marcha acompañada",
    text: "Importa la base principal desde CSV o Excel y define con el equipo el alcance de una migración más amplia antes de empezar.",
  },
  {
    title: "Roles claros",
    text: "El director mantiene la visión global, los coaches trabajan sobre sus sesiones y las familias reciben solo la información vinculada.",
  },
];

export default function TestimonialsPage() {
  return (
    <section id="clientes" className="px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Diseñado para dirigir gimnasias con claridad
          </h2>
          <p className="mt-3 font-sans text-sm text-muted-foreground">
            Capacidades concretas para reducir tareas dispersas y mejorar la coordinación del equipo.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {proofPoints.map((testimonial) => (
            <Card
              key={testimonial.title}
              className="flex h-full flex-col border border-border bg-card p-6"
            >
              <div className="flex-grow">
                <Star className="mb-4 h-4 w-4 fill-zaltyko-teal text-zaltyko-teal" />
                <h3 className="mb-3 font-display text-lg font-semibold text-foreground">{testimonial.title}</h3>
                <p className="mb-6 font-sans text-sm text-foreground">{testimonial.text}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
