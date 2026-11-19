import type { Metadata } from "next";
import Link from "next/link";

import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";
import { ContentNoticeForm } from "@/components/element-library/ContentNoticeForm";

export const metadata: Metadata = {
  title: "Avisos sobre contenido | Zaltyko",
  description:
    "Avisa a Zaltyko si crees que un contenido publicado no debería estar, por ejemplo por derechos de autor.",
  referrer: "no-referrer",
};

/**
 * Formulario público de avisos sobre contenido (Reglamento de Servicios
 * Digitales, art. 16; ADR-0029 §8.1). No necesita cuenta ni depende de la
 * bandera de la biblioteca: si faltan las tablas, el envío responde que no
 * está disponible. Enviar un aviso no retira nada por sí solo.
 */
export default function ContentNoticePage() {
  return (
    <div className="min-h-screen bg-z-canvas text-z-ink">
      <header className="mat-field-deep border-b border-white/10 text-white">
        <div className="mx-auto flex min-h-14 w-full max-w-xl items-center px-4">
          <Link href="/" aria-label="Zaltyko, inicio">
            <ZaltykoLockup markClassName="h-7 w-7" />
          </Link>
        </div>
      </header>
      <main className="px-4 py-8 sm:py-12">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="break-words border-b-[3px] border-z-ink pb-3 font-display text-3xl font-black uppercase leading-[0.95] [text-wrap:balance] sm:text-4xl">
            Avisos sobre contenido
          </h1>
          <p className="floor-label mt-2 text-ramp-600">Derechos y contenido publicado</p>
          <p className="mt-3 text-base leading-7 text-z-soft">
            Si crees que algo publicado en Zaltyko no debería estar, por ejemplo porque los derechos son
            tuyos o de tu federación, cuéntanoslo aquí. Te pedimos lo que exige la ley para poder
            revisarlo:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-z-soft">
            <li>por qué crees que el contenido no debería estar;</li>
            <li>la dirección exacta donde lo has visto;</li>
            <li>tu nombre y tu correo electrónico;</li>
            <li>una declaración de que lo que nos cuentas es cierto y completo, de buena fe.</li>
          </ul>
          <p className="mt-3 text-sm leading-6 text-z-soft">
            Una persona revisa cada aviso y te responde por correo. Enviar un aviso no retira el contenido
            por sí solo.
          </p>
          <div className="mt-8 rounded-xl border border-z-line border-t-[3px] border-t-z-ink bg-white p-5 sm:p-6">
            <ContentNoticeForm />
          </div>
          <p className="mt-8 text-xs leading-5 text-z-soft">
            Guardamos tu nombre y tu correo hasta dos años después de cerrar el aviso.{" "}
            <Link href="/politica-privacidad" className="font-semibold text-mat underline underline-offset-2">
              Política de privacidad
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
