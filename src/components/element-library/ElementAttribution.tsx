import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { isOfficialDocumentUrl } from "@/modules/element-library/domain/element-library";
import { cn } from "@/lib/utils";

/**
 * Pie fijo de la biblioteca y de cada ficha (ADR-0029 §1.8). El texto llega
 * tal cual de la API (`elementAttributionText`); aquí solo se convierte en
 * enlace la dirección del documento oficial, si es la de la FIG. FIG solo en
 * texto: sin logos ni imágenes.
 */
export function ElementAttribution({
  attribution,
  documentUrl,
  className,
}: {
  attribution: string;
  documentUrl: string;
  className?: string;
}) {
  const at = isOfficialDocumentUrl(documentUrl) ? attribution.indexOf(documentUrl) : -1;
  return (
    <footer className={cn("border-t border-z-line pt-3", className)}>
      <p className={cn(ownerUi.help, "[overflow-wrap:anywhere]")}>
        {at < 0 ? (
          attribution
        ) : (
          <>
            {attribution.slice(0, at)}
            <a
              href={documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(ownerUi.textLink, "text-xs underline")}
            >
              {documentUrl}
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
            {attribution.slice(at + documentUrl.length)}
          </>
        )}
      </p>
    </footer>
  );
}
