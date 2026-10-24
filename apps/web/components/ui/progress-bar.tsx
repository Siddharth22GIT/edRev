export function ProgressBar({
  value,
  label,
  tone = "orange",
}: {
  value: number;
  label?: string;
  tone?: "orange" | "blue" | "emerald";
}) {
  const safeValue = Math.min(100, Math.max(0, value));
  const toneClasses = {
    orange: "bg-[#F2A65A]",
    blue: "bg-[#3978B8]",
    emerald: "bg-emerald-600",
  };

  return (
    <div>
      {label ? (
        <div className="mb-2 flex justify-between text-xs font-semibold text-[#666D7A]">
          <span>{label}</span>
          <span className="font-bold text-[#30343B]">{safeValue}%</span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-[#E6E6E6]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${toneClasses[tone]}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
