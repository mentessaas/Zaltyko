export default function CoachSessionLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6" aria-label="Cargando clase de hoy">
      <div className="h-11 w-48 rounded-xl bg-zaltyko-mist/40" />
      <div className="h-64 rounded-3xl bg-zaltyko-navy/10" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-2xl bg-zaltyko-mist/40" />
        <div className="h-20 rounded-2xl bg-zaltyko-mist/40" />
        <div className="h-20 rounded-2xl bg-zaltyko-mist/40" />
      </div>
      <div className="h-[420px] rounded-3xl bg-zaltyko-mist/30" />
    </div>
  );
}
