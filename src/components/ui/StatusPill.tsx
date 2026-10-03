export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "muted";
}) {
  const styles = {
    neutral: "bg-stone-100 text-stone-700",
    success: "bg-emerald-100 text-emerald-900",
    warning: "bg-amber-100 text-amber-900",
    muted: "bg-stone-50 text-stone-500",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}
    >
      {children}
    </span>
  );
}
