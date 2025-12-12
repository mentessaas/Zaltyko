import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Regístrate para comenzar a gestionar tu academia",
  openGraph: {
    title: "Crear cuenta | Zaltyko",
    description: "Regístrate en Zaltyko para habilitar tu academia",
  },
};

export default function Register() {
  return <RegisterForm />;
}
