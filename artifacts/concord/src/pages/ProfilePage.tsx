import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Activity, CheckCircle2, XCircle, Clock, ArrowRight,
  ExternalLink, Lock, Wallet, ShieldCheck, ChevronRight,
  TrendingUp, Hash, Calendar,
} from "lucide-react";
import { useAccount } from "wagmi";
import NavBar from "@/components/NavBar";
import {
  getAllRooms, shortAddress, NEGOTIATION_TYPES,
  type Room, type NegotiationType,
} from "@/lib/concord";
import { getExplorerTxUrl, BLIND_NEGOTIATION_ADDRESS } from "@/lib/contracts";

// ── Helpers ──────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "Just now";
}

function statusColor(status: Room["status"]): string {
  switch (status) {
    case "settled":  return "#30d158";
    case "expired":  return "#ff453a";
    case "pending_b":
    case "computing": return "#ffd60a";
    default:         return "#8e8e93";
  }
}

function statusLabel(room: Room): string {
  if (room.status === "settled" && room.result) {
    return room.result.matched ? "Deal Found" : "No Overlap";
  }
  switch (room.status) {
    case "settled":   return "Settled";
    case "pending_b": return "Awaiting Party B";
    case "computing": return "Computing";
    case "expired":   return "Expired";
    default:          return "Open";
  }
}

const TYPE_ICONS: Record<NegotiationType, string> = {
  ma:         "🏢",
  salary:     "💼",
  realestate: "🏠",
  custom:     "🤝",
};

// ── Component ────────────────────────────────────────────────────

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const { address, isConnected } = useAccount();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filter, setFilter] = useState<"all" | "settled" | "active" | "expired">("all");

  useEffect(() => {
    setRooms(getAllRooms());
  }, []);

  // Stats
  const totalRooms    = rooms.length;
  const dealsFound    = rooms.filter(r => r.result?.matched).length;
  const noOverlap     = rooms.filter(r => r.result && !r.result.matched).length;
  const activeRooms   = rooms.filter(r => r.status === "pending_b" || r.status === "computing").length;

  // Filter
  const filtered = rooms.filter(r => {
    if (filter === "settled") return r.status === "settled";
    if (filter === "active")  return r.status === "pending_b" || r.status === "computing";
    if (filter === "expired") return r.status === "expired";
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-16 px-6 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.32, 0, 0, 1] }}
          className="pt-8 space-y-5"
        >
          {/* ── Profile Header ───────────────────────────────── */}
          <div className="apple-card p-6 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, rgba(10,132,255,0.18), rgba(48,209,88,0.12))", border: "1.5px solid rgba(10,132,255,0.25)" }}>
              {isConnected && address
                ? <span className="text-[22px] font-bold text-[#0a84ff]">{address.slice(2, 4).toUpperCase()}</span>
                : <User className="w-8 h-8 text-foreground/30" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="sf-display text-[22px] text-foreground mb-0.5">Profile</h1>
              {isConnected && address ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] text-foreground/50">{shortAddress(address)}</span>
                  <a href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
                    className="text-[#0a84ff] hover:underline">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <p className="text-[13px] text-foreground/40">Connect wallet to see your history</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "rgba(10,132,255,0.08)", color: "#0a84ff", border: "1px solid rgba(10,132,255,0.2)" }}>
              <ShieldCheck className="w-3 h-3" /> Base Sepolia
            </div>
          </div>

          {/* ── Stats Grid ───────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Negotiations", value: totalRooms, icon: Activity,       color: "#0a84ff" },
              { label: "Deals Found",         value: dealsFound,  icon: CheckCircle2, color: "#30d158" },
              { label: "No Overlap",          value: noOverlap,   icon: XCircle,      color: "#ff453a" },
              { label: "Active",              value: activeRooms, icon: Clock,        color: "#ffd60a" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="apple-card p-4 text-center">
                <div className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center"
                  style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="sf-display text-[26px] leading-none mb-1" style={{ color }}>{value}</div>
                <div className="text-[10px] text-foreground/35 font-semibold uppercase tracking-wider leading-tight">{label}</div>
              </div>
            ))}
          </div>

          {/* ── Negotiation History ─────────────────────────── */}
          <div className="apple-card overflow-hidden">
            {/* Header + filters */}
            <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-foreground/40" />
                <span className="text-[13px] font-semibold text-foreground">Negotiation History</span>
              </div>
              <div className="flex items-center gap-1">
                {(["all", "active", "settled", "expired"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg capitalize transition-colors"
                    style={{
                      background: filter === f ? "rgba(10,132,255,0.12)" : "transparent",
                      color: filter === f ? "#0a84ff" : "hsl(var(--muted-foreground))",
                    }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <Activity className="w-10 h-10 text-foreground/15 mx-auto mb-3" />
                <p className="text-[14px] text-foreground/30">No negotiations yet</p>
                <button onClick={() => navigate("/create")}
                  className="btn-apple mt-4 px-5 py-2.5 text-[13px] inline-flex items-center gap-2">
                  Start Your First <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
                {filtered.map((room, i) => {
                  const meta = NEGOTIATION_TYPES[room.type];
                  const matched = room.result?.matched;
                  const agreedPrice = room.result?.agreedPrice;
                  const col = statusColor(room.status);

                  return (
                    <motion.div
                      key={room.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => navigate(room.status === "settled" ? `/result/${room.id}` : `/room/${room.id}`)}
                    >
                      {/* Type icon */}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[18px]"
                        style={{ background: "rgba(10,132,255,0.06)", border: "1px solid rgba(10,132,255,0.12)" }}>
                        {TYPE_ICONS[room.type]}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[14px] font-semibold text-foreground truncate">
                            {room.label}
                            {room.myPrice ? ` · ${room.myPrice}${meta.unit}` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-[11px] text-foreground/30">
                            <Calendar className="w-3 h-3" />
                            {timeAgo(room.createdAt)}
                          </div>
                          {room.partyA?.address && (
                            <div className="flex items-center gap-1 text-[11px] text-foreground/25 font-mono">
                              <Hash className="w-3 h-3" />
                              {shortAddress(room.partyA.address)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Result */}
                      <div className="shrink-0 text-right">
                        {agreedPrice && room.result?.matched ? (
                          <div className="text-[15px] font-bold sf-display" style={{ color: "#30d158" }}>
                            ${agreedPrice}{meta.unit}
                          </div>
                        ) : null}
                        <div className="flex items-center gap-1 justify-end mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: col }} />
                          <span className="text-[11px] font-semibold" style={{ color: col }}>
                            {statusLabel(room)}
                          </span>
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-foreground/20 group-hover:text-foreground/40 transition-colors shrink-0" />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Contract Info ────────────────────────────────── */}
          <div className="apple-card p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/30">Contract</p>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-foreground/40">BlindNegotiation</span>
              <a href={`https://sepolia.basescan.org/address/${BLIND_NEGOTIATION_ADDRESS}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[11px] text-[#0a84ff] hover:underline">
                {BLIND_NEGOTIATION_ADDRESS.slice(0, 10)}… <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div style={{ height: 1, background: "hsl(var(--border))" }} />
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-foreground/40">Network</span>
              <span className="text-[12px] text-foreground/70">Base Sepolia (84532)</span>
            </div>
            <div style={{ height: 1, background: "hsl(var(--border))" }} />
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-foreground/40">Encryption</span>
              <span className="text-[12px] text-foreground/70">Fhenix CoFHE (euint64)</span>
            </div>
          </div>

          {/* Start new */}
          <button onClick={() => navigate("/create")}
            className="btn-apple w-full py-3.5 text-[15px] flex items-center justify-center gap-2">
            New Negotiation <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
