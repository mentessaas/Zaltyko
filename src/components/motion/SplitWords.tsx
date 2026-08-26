"use client";

/**
 * Divide un texto en palabras y las anima con entrada escalonada.
 * Renderiza el texto plano en servidor (SEO intacto); la animación
 * se aplica en cliente y se desactiva con prefers-reduced-motion.
 */
export default function SplitWords({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          aria-hidden="true"
          className="zk-word"
          style={{ ["--zk-i" as string]: i }}
        >
          {word}
          {i < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </>
  );
}
