export default function VendorLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading dashboard…</span>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-7 w-64 rounded-lg" />
          <div className="skeleton h-4 w-48 rounded-lg" />
        </div>
        <div className="skeleton h-7 w-24 rounded-full" />
      </div>
      <div className="skeleton h-16 rounded-2xl" />
      <div className="skeleton h-40 rounded-2xl" />
      <div className="skeleton h-56 rounded-2xl" />
    </div>
  );
}
