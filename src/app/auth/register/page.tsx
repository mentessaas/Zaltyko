import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Regístrate en Zaltyko como academia, entrenador, familia, atleta o proveedor",
  openGraph: {
    title: "Crear cuenta",
    description: "Crea una cuenta personal en Zaltyko y elige tu rol inicial",
  },
};

export default function Register() {
  return <RegisterForm />;
}
