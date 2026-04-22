import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

interface InvitationPageShellProps {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  highlights: string[];
  form: React.ReactNode;
  backHref?: string;
}

export function InvitationPageShell({
  eyebrow,
  title,
  description,
  highlights,
  form,
  backHref = "/auth/login",
}: InvitationPageShellProps) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al acceso
        </Link>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1.1fr),minmax(360px,440px)] lg:px-8">
        <section className="rounded-lg border border-border bg-background px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-zaltyko-primary">
              {eyebrow}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <div className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              {description}
            </div>
          </div>

          <div className="mt-8 grid gap-3">
            {highlights.map((highlight) => (
              <div
                key={highlight}
                className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/40 px-4 py-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-zaltyko-primary" />
                <p className="text-sm leading-6 text-foreground">{highlight}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="self-start rounded-lg border border-border bg-background p-6 shadow-sm sm:p-8">
          {form}
        </aside>
      </div>
    </div>
  );
}
