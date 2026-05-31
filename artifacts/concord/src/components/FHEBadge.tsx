import { Shield, Cpu } from "lucide-react";

interface Props {
  label?: string;
  size?: "sm" | "md";
  variant?: "fhenix" | "neutral";
}

export default function FHEBadge({ label, size = "md", variant = "fhenix" }: Props) {
  const isNeutral = variant === "neutral";
  const Icon = Cpu;

  const cls = isNeutral
    ? "apple-badge-neutral"
    : "apple-badge";

  return (
    <span className={`${cls} ${size === "sm" ? "!text-[11px] !px-2.5 !py-[3px]" : ""}`}>
      <Icon className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} strokeWidth={2.5} />
      {label || "Fhenix CoFHE"}
    </span>
  );
}
