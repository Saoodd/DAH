import { cn } from "@/lib/utils";

interface BarListItem {
  label: string;
  value: number;
  colorClassName?: string;
}

export function BarList({ items, emptyLabel }: { items: BarListItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-400">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-ink-600">{item.label}</span>
            <span className="font-semibold text-ink-900">{item.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className={cn("h-full rounded-full transition-[width] duration-500", item.colorClassName ?? "bg-brand-400")}
              style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
