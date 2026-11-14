import { DEMO_ORGANIZATION_NAME } from "@/modules/demo/demo-fixtures";

/**
 * Presentación de la demo, sobre el Resumen: qué se está viendo y que nada de
 * lo que se pruebe se guarda. Los nombres de gimnastas y familias son de
 * material de gimnasia (Cinta, Aro, Mazas…) para que se lean como inventados.
 */
export function DemoIntro() {
  return (
    <section
      aria-labelledby="demo-intro-title"
      className="mx-auto w-full max-w-6xl px-5 pt-7 sm:pt-9 lg:px-10"
    >
      <div className="rounded-xl border border-z-line border-t-[3px] border-t-ochre bg-white p-5 sm:p-6">
        <h2 id="demo-intro-title" className="font-display text-xl font-black uppercase leading-none text-mat-night sm:text-2xl">
          Una academia de ejemplo
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ramp-600">
          {DEMO_ORGANIZATION_NAME} es una academia inventada, con gimnastas y familias ficticias. Recorre el panel como lo
          haría su dirección y, al final, mira lo que ve una familia. Puedes tocar todo: en la demo no se guarda nada.
        </p>
      </div>
    </section>
  );
}
