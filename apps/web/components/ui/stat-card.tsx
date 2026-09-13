import { Card } from "./card";

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  trend?: "positive" | "neutral" | "attention";
}

const trendClasses = {
  positive: "text-emerald-700",
  neutral: "text-slate-500",
  attention: "text-amber-700",
};

export function StatCard({ label, value, detail, trend = "neutral" }: StatCardProps) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className={`mt-2 text-xs font-medium ${trendClasses[trend]}`}>{detail}</p>
    </Card>
  );
}
