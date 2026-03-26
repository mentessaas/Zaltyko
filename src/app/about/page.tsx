import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/app/(site)/home/Navbar";
import Footer from "@/app/(site)/Footer";
import { Users, Target, Heart, Award, TrendingUp, Shield } from "lucide-react";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Sobre Nosotros",
  description:
    "Conoce la historia de Zaltyko. Nuestra misión es digitalizar y simplificar la gestión de academias de gimnasi en España y Latinoamérica.",
  alternates: {
    canonical: `${baseUrl}/about`,
  },
};

const stats = [
  { value: "+150", label: "Academias" },
  { value: "25,000+", label: "Atletas" },
  { value: "€4.2M", label: "Gestionados" },
  { value: "98%", label: "Satisfacción" },
];

const values = [
  {
    icon: Target,
    title: "Misión",
    description:
      " democratizar el acceso a tecnología de gestión profesional para academias de gimnasi de todos los tamaños, desde pequeños clubes hasta federaciones.",
  },
  {
    icon: Heart,
    title: "Pasión",
    description:
      "Entendemos la gimnasi porque hemos crecido con ella. Nuestro equipo incluye ex-gimnastas, entrenadores y padres que conocen los retos diarios.",
  },
  {
    icon: TrendingUp,
    title: "Innovación",
    description:
      "Mejoramos constantemente basándonos en el feedback de nuestra comunidad. Cada funcionalidad se diseña resolviendo problemas reales.",
  },
  {
    icon: Shield,
    title: "Confianza",
    description:
      "Tus datos están seguros con nosotros. Cumplimos con GDPR y usamos los más altos estándares de seguridad.",
  },
];

const team = [
  {
    name: "Carlos García",
    role: "CEO & Fundador",
    bio: "Ex-gerente de academia con 15 años en el sector.",
  },
  {
    name: "María López",
    role: "CTO",
    bio: "Ingeniera con experiencia en startups tecnológicas.",
  },
  {
    name: "Javier Ruiz",
    role: "Producto",
    bio: "Ex-entrenador de gimnasi artística, conoce el sector.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-zaltyko-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Sobre Nosotros
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-zaltyko-text-main sm:text-5xl">
            Facilitando la gestión del gimnasi
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-zaltyko-text-secondary">
            Nacimos para resolver los problemas administrativos que enfrentan las academias de gimnasi cada día.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-zaltyko-primary">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-white">{stat.value}</div>
                <div className="mt-1 text-sm text-white/80">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-zaltyko-text-main mb-6">Nuestra historia</h2>
          <div className="prose prose-lg text-zaltyko-text-secondary">
            <p>
              Zaltyko nació en 2023 cuando Carlos, gerente de una academia de gimnasi en Madrid,
              decidió que había una forma mejor de gestionar su negocio.
            </p>
            <p>
              Después de años usando hojas de cálculo, sistemas obsoletos y procesos manuales,
              se reunió con María, una desarrolladora especializada en software para empresas,
              para crear una solución moderna adaptada a las necesidades específicas de las
              academias de gimnasi.
            </p>
            <p>
              Hoy, Zaltyko ayuda a más de 150 academias en España y Latinoamérica a
              gestionar miles de atletas, procesando millones de euros en pagos каждый año.
            </p>
            <p>
              Pero esto es solo el comienzo. Nuestra misión es seguir creciendo junto
              con la comunidad de gimnasi, añadiendo funciones que realmente importan.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-zaltyko-text-main text-center mb-12">
            Nuestros valores
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => {
              const Icon = value.icon;
              return (
                <div key={index} className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zaltyko-primary/10">
                    <Icon className="h-8 w-8 text-zaltyko-primary" />
                  </div>
                  <h3 className="mt-4 font-semibold text-zaltyko-text-main">{value.title}</h3>
                  <p className="mt-2 text-sm text-zaltyko-text-secondary">{value.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-zaltyko-text-main text-center mb-12">
            Nuestro equipo
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {team.map((member, index) => (
              <div key={index} className="text-center">
                <div className="mx-auto h-24 w-24 rounded-full bg-gradient-to-br from-zaltyko-primary to-zaltyko-primary-dark flex items-center justify-center text-white text-3xl font-bold">
                  {member.name.charAt(0)}
                </div>
                <h3 className="mt-4 font-semibold text-zaltyko-text-main">{member.name}</h3>
                <p className="text-sm text-zaltyko-primary font-medium">{member.role}</p>
                <p className="mt-2 text-sm text-zaltyko-text-secondary">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-zaltyko-primary">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white">¿Quieres formar parte de nuestra historia?</h2>
          <p className="mt-4 text-lg text-white/80">
            Únete a las academias que ya confían en Zaltyko.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/onboarding"
              className="rounded-full bg-white px-8 py-3 font-semibold text-zaltyko-primary hover:bg-gray-100"
            >
              Crear academia gratis
            </Link>
            <Link
              href="/contact"
              className="rounded-full border-2 border-white px-8 py-3 font-semibold text-white hover:bg-white/10"
            >
              Contactar
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
