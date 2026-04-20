import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Inbox, X } from "lucide-react";

interface OnChainInviteToast {
  id: string;
  roomCode: string;
  sender: string;
  type: "sent" | "received";
}

export default function ToastManager() {
  const [toasts, setToasts] = useState<OnChainInviteToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type: "sent" | "received", detail: { roomCode: string; sender?: string; recipient?: string }) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, {
      id, type,
      roomCode: detail.roomCode,
      sender: detail.sender ?? detail.recipient ?? "",
    }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  useEffect(() => {
    const onSent = (e: Event) => {
      const { roomCode, recipient } = (e as CustomEvent).detail;
      addToast("sent", { roomCode, recipient });
    };
    const onReceived = (e: Event) => {
      const { roomCode, sender } = (e as CustomEvent).detail;
      addToast("received", { roomCode, sender });
    };
    window.addEventListener("concord_invite_sent", onSent);
    window.addEventListener("concord_invite_received", onReceived);
    return () => {
      window.removeEventListener("concord_invite_sent", onSent);
      window.removeEventListener("concord_invite_received", onReceived);
    };
  }, [addToast]);

  return (
    <div
      style={{
        position: "fixed", top: 20, right: 20, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none"
      }}
    >
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 48, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 48, scale: 0.94 }}
            transition={{ duration: 0.28, ease: [0.32, 0, 0, 1] }}
            style={{
              pointerEvents: "auto",
              minWidth: 280, maxWidth: 340,
              borderRadius: 16,
              padding: "14px 16px",
              background: toast.type === "sent"
                ? "rgba(10,132,255,0.12)"
                : "rgba(48,209,88,0.1)",
              border: toast.type === "sent"
                ? "1px solid rgba(10,132,255,0.3)"
                : "1px solid rgba(48,209,88,0.3)",
              backdropFilter: "blur(20px)",
              display: "flex", alignItems: "flex-start", gap: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: toast.type === "sent"
                  ? "rgba(10,132,255,0.2)"
                  : "rgba(48,209,88,0.15)",
              }}
            >
              {toast.type === "sent"
                ? <Check style={{ width: 16, height: 16, color: "#0a84ff" }} />
                : <Inbox style={{ width: 16, height: 16, color: "#30d158" }} />
              }
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))",
                marginBottom: 3, letterSpacing: "-0.01em"
              }}>
                {toast.type === "sent" ? "On-Chain invite sent" : "On-Chain invite received"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
                {toast.type === "sent"
                  ? <>Room code <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0a84ff" }}>{toast.roomCode}</span> sent on-chain</>
                  : <>Room code <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#30d158" }}>{toast.roomCode}</span> — check your inbox</>
                }
              </div>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => dismiss(toast.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 2, color: "rgba(255,255,255,0.3)", flexShrink: 0,
                display: "flex", alignItems: "center"
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}


