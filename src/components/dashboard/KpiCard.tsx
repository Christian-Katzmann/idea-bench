import { Card, CardContent } from '../ui/card';

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
}

export default function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <Card className="border-border bg-card rounded-xl shadow-none">
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          {label}
        </div>
        <div className="text-2xl font-semibold font-mono tracking-tight text-foreground">
          {value}
        </div>
        {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
