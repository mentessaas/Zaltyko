"use client";

import { Fragment } from "react";

/**
 * Divide un texto en palabras y las anima con entrada escalonada.
 * Renderiza el texto plano en servidor (SEO intacto); la animación
 * se aplica en cliente y se desactiva con prefers-reduced-motion.
 */
export default function SplitWords({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      <span className="sr-only">{text}</span>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span
            aria-hidden="true"
            className="zk-word"
            style={{ ["--zk-i" as string]: i }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}
