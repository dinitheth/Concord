import { Shield, Cpu } from "lucide-react";

interface Props {
  label?: string;
  size?: "sm" | "md";
  variant?: "fhenix" | "reineira" | "neutral";
}

export default function FHEBadge({ label, size = "md", variant = "fhenix" }: Props) {
  const isReineira = variant === "reineira";
  const isNeutral = variant === "neutral";
  const Icon = isReineira ? Shield : Cpu;

  const cls = isNeutral
    ? "apple-badge-neutral"
    : isReineira
    ? "apple-badge" + " !bg-[rgba(48,209,88,0.1)] !text-[#30d158] !border-[rgba(48,209,88,0.2)]"
    : "apple-badge";

  return (
    <span className={`${cls} ${size === "sm" ? "!text-[11px] !px-2.5 !py-[3px]" : ""}`}>
      <Icon className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} strokeWidth={2.5} />
      {label || (isReineira ? "ReineiraOS" : "Fhenix CoFHE")}
    </span>
  );
}
