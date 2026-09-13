export default function SuperAdminLoading() {
  return (
    <div
      className="space-y-8 animate-pulse"
      role="status"
      aria-live="polite"
      aria-label="Cargando panel super-admin"
    >
      <span className="sr-only">Cargando panel super-admin</span>
      <div className="space-y-3 border-b border-white/10 pb-6">
        <div className="h-3 w-32 rounded bg-white/10" />
        <div className="h-9 w-72 max-w-full rounded bg-white/10" />
        <div className="h-4 w-full max-w-2xl rounded bg-white/5" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 rounded-2xl border border-white/10 bg-white/[0.055]" />
        ))}
      </div>
      <div className="h-80 rounded-2xl border border-white/10 bg-white/[0.045]" />
    </div>
  );
}
