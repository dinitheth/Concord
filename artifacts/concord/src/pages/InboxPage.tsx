import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox, Send, ArrowRight, ShieldCheck, Clock, CheckCheck,
  RefreshCw, Link2, Lock, Unlock, Copy, Check, Gavel
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { useAccount, useReadContract } from "wagmi";
import { BLIND_NEGOTIATION_ABI, BLIND_NEGOTIATION_ADDRESS, MULTI_PARTY_AUCTION_ABI, MULTI_PARTY_AUCTION_ADDRESS, roomIdToCode } from "@/lib/contracts";

// ── Types ──────────────────────────────────────────────────────
interface OnChainInvite {
  roomId: `0x${string}`;
  sender: `0x${string}`;
  timestamp: bigint;
  negotiationType: number;
  isAuction?: boolean;
}

interface AuctionInviteRaw {
  auctionId: `0x${string}`;
  sender: `0x${string}`;
  timestamp: bigint;
  negotiationType: number;
}

const NEG_TYPE_LABELS: Record<number, string> = {
  0: "M&A", 1: "Salary", 2: "Real Estate", 3: "Custom",
};

function timeAgo(ts: bigint): string {
  const seconds = Math.floor(Date.now() / 1000) - Number(ts);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function truncAddr(addr: string): string {
  if (addr.startsWith("0x") && addr.length > 12) return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
  return addr;
}

// ── Decryptable Invite Card ─────────────────────────────────────
function InviteCard({ 
  inv, 
  onJoin, 
  isSent = false 
}: { 
  inv: OnChainInvite; 
  onJoin: (roomId: string, code: string, isAuction: boolean) => void;
  isSent?: boolean;
}) {
  const [decrypted, setDecrypted] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");

  const handleDecrypt = async () => {
    setDecrypting(true);
    // Simulate decrypt animation (250ms)
    await new Promise(r => setTimeout(r, 900));
    setCode(roomIdToCode(inv.roomId));
    setDecrypting(false);
    setDecrypted(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inv.roomId); // Copy full bytes32 for JoinRoom
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="apple-card p-5"
      style={{ borderColor: decrypted ? "rgba(48,209,88,0.3)" : inv.isAuction ? "rgba(255,149,0,0.25)" : "rgba(120,80,255,0.25)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-500"
            style={{
              background: decrypted ? "rgba(48,209,88,0.12)" : inv.isAuction ? "rgba(255,149,0,0.12)" : "rgba(120,80,255,0.12)",
              border: decrypted ? "1px solid rgba(48,209,88,0.25)" : inv.isAuction ? "1px solid rgba(255,149,0,0.2)" : "1px solid rgba(120,80,255,0.2)"
            }}
          >
            {decrypted
              ? <ShieldCheck className="w-4 h-4 text-[#30d158]" />
              : inv.isAuction
              ? <Gavel className="w-4 h-4" style={{ color: "#ff9500" }} />
              : <Lock className="w-4 h-4" style={{ color: "#a78bfa" }} />
            }
          </div>
          <div>
            <div className="text-[13px] font-semibold text-foreground">
              {inv.isAuction ? "🔨 Auction" : ""} {NEG_TYPE_LABELS[inv.negotiationType % 10] ?? "Negotiation"} {isSent ? "Invite Sent" : "Invite"}
            </div>
            {inv.isAuction && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "rgba(255,149,0,0.12)", color: "#ff9500" }}>Sealed-Bid</span>
            )}
            <div className="text-[11px] text-foreground/35 font-mono">
              {isSent ? "encrypted on Base Sepolia" : `from ${truncAddr(inv.sender)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-foreground/25 shrink-0">
          <Clock className="w-3 h-3" />
          <span className="text-[11px]">{timeAgo(inv.timestamp)}</span>
        </div>
      </div>

      {/* Encrypted / Decrypted code block */}
      <div
        className="rounded-xl px-4 py-4 mb-4 transition-all duration-500"
        style={{
          background: decrypted ? "rgba(48,209,88,0.06)" : "rgba(10,132,255,0.06)",
          border: decrypted ? "1px solid rgba(48,209,88,0.2)" : "1px solid rgba(10,132,255,0.15)",
        }}
      >
        <p className="text-[10px] font-bold text-foreground/25 uppercase tracking-widest mb-2">
          {decrypted ? "Room Code — Decrypted" : "Encrypted Room Code"}
        </p>

        <AnimatePresence mode="wait">
          {!decrypted && !decrypting && (
            <motion.div
              key="encrypted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-mono text-[22px] font-bold tracking-widest select-none"
              style={{ color: "rgba(160,130,255,0.4)", filter: "blur(4px)", letterSpacing: "0.2em" }}
            >
              ██·███
            </motion.div>
          )}

          {decrypting && (
            <motion.div
              key="decrypting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <div className="w-4 h-4 border-2 border-[#a78bfa]/30 border-t-[#a78bfa] rounded-full animate-spin" />
              <span className="text-[12px] text-[#a78bfa] font-mono">Decrypting on-chain data…</span>
            </motion.div>
          )}

          {decrypted && (
            <motion.div
              key="revealed"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="flex items-center justify-between"
            >
              <div
                className="font-mono text-[30px] font-bold text-foreground tracking-widest"
                style={{ letterSpacing: "0.18em" }}
              >
                {code}
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: copied ? "rgba(48,209,88,0.15)" : "var(--subtle-bg)",
                  border: copied ? "1px solid rgba(48,209,88,0.3)" : "1px solid var(--card-border-color)",
                  color: copied ? "#30d158" : "var(--text-secondary)"
                }}
              >
                {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Description */}
      <p className="text-[12px] text-foreground/35 mb-4 leading-relaxed">
        {decrypted
          ? (isSent ? "Room code revealed. Copy it and share it with your counterparty manually." : "Room code revealed. Copy it and paste at /join to submit your encrypted price.")
          : (isSent ? "You've sent an on-chain invite. Decrypt it to reveal the room code." : "You've received an on-chain negotiation invite. Decrypt it to reveal the room code.")
        }
      </p>

      {/* Action buttons */}
      {!decrypted ? (
        <button
          onClick={handleDecrypt}
          disabled={decrypting}
          className="btn-apple w-full py-3 text-[13px] flex items-center justify-center gap-2"
          style={{ opacity: decrypting ? 0.6 : 1 }}
        >
          <Unlock className="w-3.5 h-3.5" />
          Decrypt Room Code
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 py-3 text-[13px] flex items-center justify-center gap-2 rounded-xl font-semibold transition-all"
            style={{
              background: "var(--subtle-bg)",
              border: "1px solid hsl(var(--))",
              color: "hsl(var(--foreground))", opacity: 0.7
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Code
          </button>
          <button
            onClick={() => onJoin(inv.roomId, code, !!inv.isAuction)}
            className="flex-1 btn-apple py-3 text-[13px] flex items-center justify-center gap-2"
          >
            {isSent ? (inv.isAuction ? "Open Auction Room" : "Open Your Room") : "Join Room"}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Main InboxPage ─────────────────────────────────────────────
export default function InboxPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"received" | "sent">("received");
  const { address, isConnected } = useAccount();

  // ── Read invites from BlindNegotiation (1-on-1 rooms) ────────
  const {
    data: receivedRaw,
    isLoading: loadingReceived,
    refetch: refetchReceived,
  } = useReadContract({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    functionName: "getReceivedInvites",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const {
    data: sentRaw,
    isLoading: loadingSent,
    refetch: refetchSent,
  } = useReadContract({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    functionName: "getSentInvites",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // ── Read invites from MultiPartyAuction ──────────────────────
  const {
    data: auctionReceivedRaw,
    isLoading: loadingAuctionReceived,
    refetch: refetchAuctionReceived,
  } = useReadContract({
    address: MULTI_PARTY_AUCTION_ADDRESS,
    abi: MULTI_PARTY_AUCTION_ABI,
    functionName: "getReceivedInvites",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const {
    data: auctionSentRaw,
    isLoading: loadingAuctionSent,
    refetch: refetchAuctionSent,
  } = useReadContract({
    address: MULTI_PARTY_AUCTION_ADDRESS,
    abi: MULTI_PARTY_AUCTION_ABI,
    functionName: "getSentInvites",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // ── Merge invites from both contracts ─────────────────────────
  const roomReceived: OnChainInvite[] = ((receivedRaw as OnChainInvite[] | undefined) ?? []).map(inv => ({ ...inv, isAuction: false }));
  const auctionReceived: OnChainInvite[] = ((auctionReceivedRaw as AuctionInviteRaw[] | undefined) ?? []).map(inv => ({
    roomId: inv.auctionId,
    sender: inv.sender,
    timestamp: inv.timestamp,
    negotiationType: inv.negotiationType,
    isAuction: true,
  }));
  const received: OnChainInvite[] = [...roomReceived, ...auctionReceived].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

  const roomSent: OnChainInvite[] = ((sentRaw as OnChainInvite[] | undefined) ?? []).map(inv => ({ ...inv, isAuction: false }));
  const auctionSent: OnChainInvite[] = ((auctionSentRaw as AuctionInviteRaw[] | undefined) ?? []).map(inv => ({
    roomId: inv.auctionId,
    sender: inv.sender,
    timestamp: inv.timestamp,
    negotiationType: inv.negotiationType,
    isAuction: true,
  }));
  const sent: OnChainInvite[] = [...roomSent, ...auctionSent].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

  const loading = loadingReceived || loadingSent || loadingAuctionReceived || loadingAuctionSent;

  const refresh = useCallback(() => {
    refetchReceived();
    refetchSent();
    refetchAuctionReceived();
    refetchAuctionSent();
  }, [refetchReceived, refetchSent, refetchAuctionReceived, refetchAuctionSent]);

  useEffect(() => {
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleJoin = (roomIdHex: string, _code: string, isAuction: boolean = false) => {
    // Navigate to auction room or regular room based on invite type
    if (isAuction) {
      navigate(`/auction/${roomIdHex}`);
    } else {
      navigate(`/room/${roomIdHex}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-20 px-6 max-w-xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0, 0, 1] }}
          className="pt-10 mb-8"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(120,80,255,0.12)", border: "1px solid rgba(120,80,255,0.25)" }}
              >
                <Inbox className="w-5 h-5" style={{ color: "#a78bfa" }} />
              </div>
              <div>
                <h1 className="sf-display text-[28px] text-foreground leading-tight">Inbox</h1>
                <p className="text-[13px] text-foreground/38">
                  {isConnected ? "On-chain invites · Base Sepolia" : "Connect wallet to view invites"}
                </p>
              </div>
            </div>
            {isConnected && (
              <button
                onClick={refresh}
                disabled={loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                style={{ background: "hsl(var(--secondary))", border: "1px solid var(--card-border-color)" }}
              >
                <RefreshCw className={`w-4 h-4 text-foreground/40 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>

          {isConnected && (
            <div className="mt-3">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold"
                style={{ background: "rgba(48,209,88,0.08)", border: "1px solid rgba(48,209,88,0.2)", color: "#30d158" }}
              >
                <Link2 className="w-3 h-3" />
                Encrypted on-chain · No external apps needed
              </div>
            </div>
          )}
        </motion.div>

        {/* Tabs */}
        <div
          className="flex rounded-2xl p-1 mb-6"
          style={{ background: "hsl(var(--secondary))", border: "1px solid var(--card-border-color)" }}
        >
          {[
            { id: "received", label: "Received", icon: Inbox, count: received.length },
            { id: "sent", label: "Sent", icon: Send, count: sent.length },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as "received" | "sent")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all duration-200"
              style={{
                background: tab === t.id ? "rgba(120,80,255,0.18)" : "transparent",
                border: tab === t.id ? "1px solid rgba(120,80,255,0.3)" : "1px solid transparent",
                color: tab === t.id ? "#a78bfa" : "var(--text-secondary)",
                fontSize: 13, fontWeight: 600
              }}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.count > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: tab === t.id ? "rgba(120,80,255,0.3)" : "var(--subtle-bg)",
                    color: tab === t.id ? "#a78bfa" : "var(--text-tertiary)"
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── RECEIVED ── */}
          {tab === "received" && (
            <motion.div key="received" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {!isConnected ? (
                <div className="text-center py-12">
                  <div
                    className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "var(--subtle-bg)", border: "1px solid var(--card-border-color)" }}
                  >
                    <Lock className="w-6 h-6 text-foreground/20" />
                  </div>
                  <p className="text-[16px] font-semibold text-foreground/50 mb-2">Connect your wallet</p>
                  <p className="text-[13px] text-foreground/25 max-w-xs mx-auto leading-relaxed">
                    Connect your wallet to decrypt and view invites stored on Base Sepolia.
                  </p>
                </div>
              ) : loadingReceived ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 mx-auto mb-4 border-2 border-white/10 border-t-[#a78bfa] rounded-full animate-spin" />
                  <p className="text-[13px] text-foreground/35">Reading from blockchain…</p>
                </div>
              ) : received.length === 0 ? (
                <div className="text-center py-12">
                  <div
                    className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "var(--subtle-bg)", border: "1px solid var(--card-border-color)" }}
                  >
                    <Inbox className="w-6 h-6 text-foreground/20" />
                  </div>
                  <p className="text-[16px] font-semibold text-foreground/50 mb-2">No invites yet</p>
                  <p className="text-[13px] text-foreground/25 max-w-xs mx-auto leading-relaxed">
                    When an initiator sends you an on-chain encrypted invite, it will appear here. Decrypt it to reveal the room code.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-[11px] text-foreground/25 block mb-1">
                    {received.length} encrypted invite{received.length !== 1 ? "s" : ""}
                  </span>
                  {received.map((inv, i) => (
                    <InviteCard key={`${inv.roomId}-${i}`} inv={inv} onJoin={handleJoin} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── SENT ── */}
          {tab === "sent" && (
            <motion.div key="sent" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {!isConnected ? (
                <div className="text-center py-16">
                  <p className="text-[16px] font-semibold text-foreground/50 mb-2">Connect your wallet</p>
                </div>
              ) : loadingSent ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 mx-auto mb-4 border-2 border-white/10 border-t-[#30d158] rounded-full animate-spin" />
                  <p className="text-[13px] text-foreground/35">Reading from blockchain…</p>
                </div>
              ) : sent.length === 0 ? (
                <div className="text-center py-16">
                  <div
                    className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "var(--subtle-bg)", border: "1px solid var(--card-border-color)" }}
                  >
                    <Send className="w-6 h-6 text-foreground/20" />
                  </div>
                  <p className="text-[16px] font-semibold text-foreground/50 mb-2">No sent invites</p>
                  <p className="text-[13px] text-foreground/25 max-w-xs mx-auto leading-relaxed">
                    Invites you send on-chain from the Create Room page appear here — permanently stored on Base Sepolia.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-[11px] text-foreground/25 block mb-1">{sent.length} sent</span>
                  {sent.map((inv, i) => (
                    <InviteCard key={`sent-${inv.roomId}-${i}`} inv={inv} onJoin={handleJoin} isSent={true} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}




