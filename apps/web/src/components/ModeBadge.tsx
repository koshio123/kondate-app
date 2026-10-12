export type DayMode = "normal" | "quick" | "none";

const STYLES: Record<DayMode, { label: string; className: string }> = {
  normal: { label: "通常", className: "bg-primary text-white" },
  quick: { label: "時短", className: "bg-quick text-white" },
  none: { label: "なし", className: "bg-rest text-white" },
};

/** Day mode label. Modes differ by text as well as colour. */
export function ModeBadge({ mode }: { mode: DayMode }) {
  const { label, className } = STYLES[mode];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>
  );
}
