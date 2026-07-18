export default function AdminLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading dashboard…</span>
      <div className="space-y-2">
        <div className="skeleton h-7 w-56 rounded-lg" />
        <div className="skeleton h-4 w-72 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}
