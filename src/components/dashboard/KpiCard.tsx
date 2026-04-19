/**
 * GitSlip-style KPI tile.
 * Uppercase small-caps label + large monospaced number + optional hint.
 * Uses a plain rounded-xl card surface rather than the full shadcn <Card>
 * so the tile is denser and the number carries visual weight on its own.
 */
export default function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
