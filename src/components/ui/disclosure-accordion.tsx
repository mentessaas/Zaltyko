"use client";

/**
 * Acordeón sobre <details>/<summary> nativos.
 *
 * Origen: @mischief/accordion (https://ui.tinkererslabs.com/r/accordion.json,
 * MIT), encontrado con ui-indexador. Adaptado a Zaltyko: anillo de foco con
 * el token `ring`, radio de la marca y tipos compatibles con React 18.
 *
 * El navegador gestiona abrir/cerrar, el teclado y "buscar en la página";
 * el contenido cerrado sigue en el HTML (indexable). La exclusividad usa el
 * atributo `name` compartido de <details>.
 */
import * as React from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export type DisclosureAccordionItem = {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
};

export type DisclosureAccordionProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue"
> & {
  items: readonly DisclosureAccordionItem[];
  /** Solo un panel abierto a la vez. Por defecto true. */
  exclusive?: boolean;
  /** Ids abiertos en el primer render. */
  defaultOpen?: readonly string[];
  icon?: React.ReactNode;
  onToggle?: (id: string, open: boolean) => void;
  classNames?: {
    item?: string;
    trigger?: string;
    marker?: string;
    content?: string;
  };
};

export function DisclosureAccordion({
  items,
  exclusive = true,
  defaultOpen,
  icon,
  onToggle,
  classNames,
  className,
  ...rootProps
}: DisclosureAccordionProps) {
  const groupName = React.useId();
  const open = React.useMemo(() => new Set(defaultOpen ?? []), [defaultOpen]);

  return (
    <div
      data-slot="accordion"
      className={cn(
        "min-w-0 divide-y divide-border overflow-hidden rounded-xl border border-border",
        className
      )}
      {...rootProps}
    >
      {items.map((item) => {
        // `name` en <details> no está en los tipos de React 18.
        const detailsProps = (exclusive ? { name: groupName } : {}) as React.DetailsHTMLAttributes<HTMLDetailsElement>;
        return (
          <details
            key={item.id}
            data-slot="accordion-item"
            {...detailsProps}
            open={open.has(item.id) || undefined}
            className={cn("group bg-card/40 open:bg-card", classNames?.item)}
            onToggle={(event) =>
              onToggle?.(item.id, (event.currentTarget as HTMLDetailsElement).open)
            }
          >
            <summary
              data-slot="accordion-trigger"
              className={cn(
                "flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm text-foreground outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
                classNames?.trigger
              )}
            >
              <span className="min-w-0 flex-1">{item.title}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none",
                  classNames?.marker
                )}
              >
                {icon ?? <Plus size={18} strokeWidth={1.8} />}
              </span>
            </summary>

            <div
              data-slot="accordion-content"
              className={cn(
                "px-4 pb-4 text-sm leading-relaxed text-muted-foreground",
                classNames?.content
              )}
            >
              {item.content}
            </div>
          </details>
        );
      })}
    </div>
  );
}
