import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Inbox, X, Gavel } from "lucide-react";
import { useAccount, useWatchContractEvent } from "wagmi";
import {
  BLIND_NEGOTIATION_ABI,
  BLIND_NEGOTIATION_ADDRESS,
  MULTI_PARTY_AUCTION_ABI,
  MULTI_PARTY_AUCTION_ADDRESS,
  roomIdToCode
} from "@/lib/contracts";

interface OnChainInviteToast {
  id: string;
  roomCode: string;
  sender: string;
  type: "sent" | "received";
  isAuction?: boolean;
}

export default function ToastManager() {
  const [toasts, setToasts] = useState<OnChainInviteToast[]>([]);
  const { address } = useAccount();
  const processedLogs = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type: "sent" | "received", detail: { roomCode: string; sender?: string; recipient?: string; isAuction?: boolean }) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, {
      id, type,
      roomCode: detail.roomCode,
      sender: detail.sender ?? detail.recipient ?? "",
      isAuction: detail.isAuction,
    }]);
    setTimeout(() => dismiss(id), 8000);
  }, [dismiss]);

  // Watch for standard negotiation invites
  useWatchContractEvent({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    eventName: "InviteSent",
    onLogs(logs) {
      if (!address) return;
      for (const log of logs) {
        const logId = `${log.transactionHash}-${log.logIndex}`;
        if (processedLogs.current.has(logId)) continue;
        processedLogs.current.add(logId);

        const { roomId, sender, recipient } = log.args;
        if (!roomId || !recipient || !sender) continue;

        const roomCode = roomIdToCode(roomId);
        if (recipient.toLowerCase() === address.toLowerCase()) {
          addToast("received", { roomCode, sender, isAuction: false });
        } else if (sender.toLowerCase() === address.toLowerCase()) {
          addToast("sent", { roomCode, recipient, isAuction: false });
        }
      }
    }
  });

  // Watch for auction invites
  useWatchContractEvent({
    address: MULTI_PARTY_AUCTION_ADDRESS,
    abi: MULTI_PARTY_AUCTION_ABI,
    eventName: "AuctionInviteSent",
    onLogs(logs) {
      if (!address) return;
      for (const log of logs) {
        const logId = `${log.transactionHash}-${log.logIndex}`;
        if (processedLogs.current.has(logId)) continue;
        processedLogs.current.add(logId);

        const { auctionId, sender, recipient } = log.args;
        if (!auctionId || !recipient || !sender) continue;

        const roomCode = roomIdToCode(auctionId);
        if (recipient.toLowerCase() === address.toLowerCase()) {
          addToast("received", { roomCode, sender, isAuction: true });
        } else if (sender.toLowerCase() === address.toLowerCase()) {
          addToast("sent", { roomCode, recipient, isAuction: true });
        }
      }
    }
  });

  useEffect(() => {
    const onSent = (e: Event) => {
      const { roomCode, recipient, isAuction } = (e as CustomEvent).detail;
      addToast("sent", { roomCode, recipient, isAuction });
    };
    const onReceived = (e: Event) => {
      const { roomCode, sender, isAuction } = (e as CustomEvent).detail;
      addToast("received", { roomCode, sender, isAuction });
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
                : toast.isAuction
                ? "rgba(255,149,0,0.1)"
                : "rgba(48,209,88,0.1)",
              border: toast.type === "sent"
                ? "1px solid rgba(10,132,255,0.3)"
                : toast.isAuction
                ? "1px solid rgba(255,149,0,0.3)"
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
                  : toast.isAuction
                  ? "rgba(255,149,0,0.15)"
                  : "rgba(48,209,88,0.15)",
              }}
            >
              {toast.type === "sent" ? (
                <Check style={{ width: 16, height: 16, color: "#0a84ff" }} />
              ) : toast.isAuction ? (
                <Gavel style={{ width: 16, height: 16, color: "#ff9500" }} />
              ) : (
                <Inbox style={{ width: 16, height: 16, color: "#30d158" }} />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))",
                marginBottom: 3, letterSpacing: "-0.01em"
              }}>
                {toast.type === "sent" 
                  ? (toast.isAuction ? "On-Chain auction invite sent" : "On-Chain invite sent") 
                  : (toast.isAuction ? "On-Chain auction invite received" : "On-Chain invite received")}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
                {toast.type === "sent"
                  ? <>Room code <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0a84ff" }}>{toast.roomCode}</span> sent on-chain</>
                  : <>Decrypt the invite in your inbox to reveal the room code</>
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
