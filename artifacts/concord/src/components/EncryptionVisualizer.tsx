import { useEffect, useState } from "react";
import { Lock, EyeOff } from "lucide-react";
import { formatCiphertextDisplay } from "@/lib/fhe";

interface Props {
  isEncrypting: boolean;
  isEncrypted: boolean;
  ciphertextHex?: string;
  label?: string;
}

export default function EncryptionVisualizer({ isEncrypting, isEncrypted, ciphertextHex, label }: Props) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isEncrypting) return;
    const iv = setInterval(() => setFrame(f => f + 1), 90);
    return () => clearInterval(iv);
  }, [isEncrypting]);

  const randomHex = () => {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(" ");
  };

  return (
    <div className={`rounded-2xl p-4 transition-all duration-500 ${
      isEncrypted
        ? "bg-[rgba(10,132,255,0.06)] border border-[rgba(10,132,255,0.2)]"
        : isEncrypting
        ? "shimmer-blue bg-[rgba(10,132,255,0.04)] border border-[rgba(10,132,255,0.15)]"
        : "bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isEncrypted
            ? <EyeOff className="w-3.5 h-3.5 text-[#0a84ff]" />
            : <Lock className="w-3.5 h-3.5 text-foreground/40" />
          }
          <span className="text-[13px] font-medium text-foreground/80">{label || "Encrypted Value"}</span>
        </div>
        <span className={`text-[11px] font-mono font-medium rounded-full px-2 py-0.5 ${
          isEncrypted
            ? "bg-[rgba(10,132,255,0.12)] text-[#0a84ff]"
            : isEncrypting
            ? "bg-[rgba(255,214,10,0.12)] text-amber-600 dark:text-[#ffd60a]"
            : "bg-black/5 dark:bg-white/5 text-foreground/50"
        }`}>
          {isEncrypted ? "euint64" : isEncrypting ? "encrypting…" : "plaintext"}
        </span>
      </div>

      {isEncrypted && ciphertextHex ? (
        <div>
          <div className="hex-display">{formatCiphertextDisplay(ciphertextHex)}</div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-foreground/30">
            <EyeOff className="w-3 h-3" />
            <span>64-byte ciphertext — original value invisible on-chain</span>
          </div>
        </div>
      ) : isEncrypting ? (
        <div className="hex-display opacity-60" key={frame}>{randomHex()}</div>
      ) : (
        <div className="text-[13px] text-foreground/25 italic">
          Your value will appear as encrypted bytes here
        </div>
      )}
    </div>
  );
}

