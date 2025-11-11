import type { Metadata } from "next";
import { RegisterForm } from "@/components/RegisterForm";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Regístrate para comenzar a gestionar tu academia",
  openGraph: {
    title: "Crear cuenta | GymnaSaaS",
    description: "Regístrate en GymnaSaaS para habilitar tu academia",
  },
};

export default function Register() {
  return <RegisterForm />;
}
