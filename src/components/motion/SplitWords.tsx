/**
 * Divide un texto en palabras y les aplica una clase con animación CSS
 * escalonada (`--zk-i` controla el delay). Es un Server Component: el H1
 * aparece completo en el HTML inicial, mejorando el LCP. La animación es
 * pura CSS y ya respeta `prefers-reduced-motion` (motion.css).
 */
export default function SplitWords({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
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
