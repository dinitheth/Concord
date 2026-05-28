import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Activity, CheckCircle2, XCircle, Clock, ArrowRight,
  ExternalLink, Lock, Wallet, ShieldCheck, ChevronRight,
  TrendingUp, Hash, Calendar, Building2, Briefcase, Home, Handshake, Gavel, Trophy
} from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import NavBar from "@/components/NavBar";
import {
  getAllRooms, shortAddress, NEGOTIATION_TYPES,
  type Room, type NegotiationType, getAllAuctions, type Auction, type AuctionStatusType
} from "@/lib/concord";
import { getExplorerTxUrl, BLIND_NEGOTIATION_ADDRESS, MULTI_PARTY_AUCTION_ADDRESS, MULTI_PARTY_AUCTION_ABI } from "@/lib/contracts";

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

// ── Negotiation type icon map (Lucide icons, no emojis) ──────────
const TYPE_ICON_MAP: Record<NegotiationType, React.ElementType> = {
  ma:         Building2,
  salary:     Briefcase,
  realestate: Home,
  custom:     Handshake,
};

const TYPE_COLOR_MAP: Record<NegotiationType, string> = {
  ma:         "#0a84ff",
  salary:     "#30d158",
  realestate: "#ff9f0a",
  custom:     "#bf5af2",
};

// ── Component ────────────────────────────────────────────────────

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const { address, isConnected } = useAccount();
  
  const [activeTab, setActiveTab] = useState<"negotiations" | "auctions">("negotiations");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [filter, setFilter] = useState<"all" | "settled" | "active" | "expired">("all");

  // Read on-chain received/sent invites to discover auctions not saved in localStorage
  const { data: auctionReceivedRaw } = useReadContract({
    address: MULTI_PARTY_AUCTION_ADDRESS,
    abi: MULTI_PARTY_AUCTION_ABI,
    functionName: "getReceivedInvites",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: auctionSentRaw } = useReadContract({
    address: MULTI_PARTY_AUCTION_ADDRESS,
    abi: MULTI_PARTY_AUCTION_ABI,
    functionName: "getSentInvites",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  useEffect(() => {
    // 1. Load 1-on-1 Rooms
    setRooms(getAllRooms());

    // 2. Load and merge Auctions
    const localAuctions = getAllAuctions();
    const mergedAuctions = [...localAuctions];

    // Discover from on-chain received invites
    if (auctionReceivedRaw && Array.isArray(auctionReceivedRaw)) {
      auctionReceivedRaw.forEach((inv: any) => {
        const exists = mergedAuctions.some(a => a.id.toLowerCase() === inv.auctionId.toLowerCase());
        if (!exists) {
          const negKey = (["ma", "salary", "realestate", "custom"] as const)[inv.negotiationType % 10] || "custom";
          mergedAuctions.push({
            id: inv.auctionId,
            auctionIdHex: inv.auctionId,
            type: negKey,
            label: NEGOTIATION_TYPES[negKey].label,
            status: "open",
            maxBidders: 0,
            bids: [],
            seller: { address: inv.sender, timestamp: Number(inv.timestamp) * 1000 },
            createdAt: Number(inv.timestamp) * 1000,
            deadline: 0,
          });
        }
      });
    }

    // Discover from on-chain sent invites
    if (auctionSentRaw && Array.isArray(auctionSentRaw)) {
      auctionSentRaw.forEach((inv: any) => {
        const exists = mergedAuctions.some(a => a.id.toLowerCase() === inv.auctionId.toLowerCase());
        if (!exists) {
          const negKey = (["ma", "salary", "realestate", "custom"] as const)[inv.negotiationType % 10] || "custom";
          mergedAuctions.push({
            id: inv.auctionId,
            auctionIdHex: inv.auctionId,
            type: negKey,
            label: NEGOTIATION_TYPES[negKey].label,
            status: "open",
            maxBidders: 0,
            bids: [],
            seller: { address: address || inv.sender, timestamp: Number(inv.timestamp) * 1000 },
            createdAt: Number(inv.timestamp) * 1000,
            deadline: 0,
          });
        }
      });
    }

    // Sort descending by createdAt
    mergedAuctions.sort((a, b) => b.createdAt - a.createdAt);
    setAuctions(mergedAuctions);
  }, [address, auctionReceivedRaw, auctionSentRaw]);

  // Tab-specific stats
  const stats = activeTab === "negotiations"
    ? [
        { label: "Total Negotiations", value: rooms.length, icon: Activity,       color: "#0a84ff" },
        { label: "Deals Found",         value: rooms.filter(r => r.result?.matched).length,  icon: CheckCircle2, color: "#30d158" },
        { label: "No Overlap",          value: rooms.filter(r => r.result && !r.result.matched).length,   icon: XCircle,      color: "#ff453a" },
        { label: "Active",              value: rooms.filter(r => r.status === "pending_b" || r.status === "computing").length, icon: Clock,        color: "#ffd60a" },
      ]
    : [
        { label: "Total Auctions",     value: auctions.length, icon: Gavel,          color: "#ff9500" },
        { label: "Wins (As Bidder)",   value: address ? auctions.filter(a => a.result?.matched && a.result?.winnerAddress?.toLowerCase() === address.toLowerCase()).length : 0, icon: CheckCircle2, color: "#30d158" },
        { label: "Sold (As Seller)",   value: address ? auctions.filter(a => a.result?.matched && a.seller?.address?.toLowerCase() === address.toLowerCase()).length : 0, icon: Trophy, color: "#ffd60a" },
        { label: "Active/Pending",     value: auctions.filter(a => a.status === "open" || a.status === "bidding" || a.status === "computing").length, icon: Clock,        color: "#0a84ff" },
      ];

  // Filtering lists
  const filteredRooms = rooms.filter(r => {
    if (filter === "settled") return r.status === "settled";
    if (filter === "active")  return r.status === "pending_b" || r.status === "computing";
    if (filter === "expired") return r.status === "expired";
    return true;
  });

  const filteredAuctions = auctions.filter(a => {
    if (filter === "settled") return a.status === "settled";
    if (filter === "active")  return a.status === "open" || a.status === "bidding" || a.status === "computing";
    if (filter === "expired") return a.status === "expired";
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

          {/* Tab Selection */}
          <div className="flex bg-muted/40 p-1 rounded-xl border border-border">
            <button
              onClick={() => { setActiveTab("negotiations"); setFilter("all"); }}
              className="flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
              style={{
                background: activeTab === "negotiations" ? "rgba(255,255,255,0.08)" : "transparent",
                color: activeTab === "negotiations" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                boxShadow: activeTab === "negotiations" ? "0 1px 3px rgba(0,0,0,0.12)" : "none"
              }}
            >
              <Handshake className="w-4 h-4" /> 1-on-1 Negotiations
            </button>
            <button
              onClick={() => { setActiveTab("auctions"); setFilter("all"); }}
              className="flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
              style={{
                background: activeTab === "auctions" ? "rgba(255,255,255,0.08)" : "transparent",
                color: activeTab === "auctions" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                boxShadow: activeTab === "auctions" ? "0 1px 3px rgba(0,0,0,0.12)" : "none"
              }}
            >
              <Gavel className="w-4 h-4" /> Sealed-Bid Auctions
            </button>
          </div>

          {/* ── Stats Grid ───────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map(({ label, value, icon: Icon, color }) => (
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

          {/* ── History Section ─────────────────────────── */}
          <div className="apple-card overflow-hidden">
            {/* Header + filters */}
            <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-foreground/40" />
                <span className="text-[13px] font-semibold text-foreground">
                  {activeTab === "negotiations" ? "Negotiation History" : "Auction History"}
                </span>
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

            {/* Negotiations List */}
            {activeTab === "negotiations" && (
              filteredRooms.length === 0 ? (
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
                  {filteredRooms.map((room, i) => {
                    const meta = NEGOTIATION_TYPES[room.type];
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
                        {(() => {
                          const Icon = TYPE_ICON_MAP[room.type] ?? Handshake;
                          const col  = TYPE_COLOR_MAP[room.type] ?? "#8e8e93";
                          return (
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: `${col}14`, border: `1px solid ${col}30` }}>
                              <Icon className="w-5 h-5" style={{ color: col }} />
                            </div>
                          );
                        })()}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[14px] font-semibold text-foreground truncate">
                              {room.dealName || room.label}
                              {room.myPrice ? (
                                <span className="font-normal text-foreground/50 ml-1">
                                  · {room.myPriceUnit === "USD" ? `$${room.myPrice.toLocaleString()}` : room.myPriceUnit ? `$${room.myPrice}${room.myPriceUnit}` : `$${room.myPrice.toLocaleString()}`}
                                </span>
                              ) : null}
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
              )
            )}

            {/* Auctions List */}
            {activeTab === "auctions" && (
              filteredAuctions.length === 0 ? (
                <div className="py-12 text-center">
                  <Gavel className="w-10 h-10 text-foreground/15 mx-auto mb-3" />
                  <p className="text-[14px] text-foreground/30">No auctions yet</p>
                  <button onClick={() => navigate("/auction/create")}
                    className="btn-apple mt-4 px-5 py-2.5 text-[13px] inline-flex items-center gap-2">
                    Create Sealed-Bid Auction <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
                  {filteredAuctions.map((auc, i) => {
                    const meta = NEGOTIATION_TYPES[auc.type];
                    const isSeller = address && auc.seller?.address?.toLowerCase() === address.toLowerCase();
                    const isWinner = address && auc.result?.winnerAddress?.toLowerCase() === address.toLowerCase();
                    const isBidder = address && auc.bids?.some(b => b.address.toLowerCase() === address.toLowerCase());
                    
                    // Style by status
                    let statusCol = "#8e8e93";
                    let statusText = "Open";
                    if (auc.status === "settled") {
                      statusCol = "#30d158";
                      statusText = auc.result?.matched ? "Winner Found" : "No Match";
                    } else if (auc.status === "computing") {
                      statusCol = "#ffd60a";
                      statusText = "Computing";
                    } else if (auc.status === "bidding" || auc.status === "open") {
                      statusCol = "#0a84ff";
                      statusText = "Bidding Open";
                    } else if (auc.status === "expired") {
                      statusCol = "#ff453a";
                      statusText = "Expired";
                    }

                    // Role tag
                    let roleTag = "";
                    if (isSeller) roleTag = "Seller";
                    else if (isWinner) roleTag = "Winner";
                    else if (isBidder) roleTag = "Bidder";

                    return (
                      <motion.div
                        key={auc.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer group"
                        onClick={() => navigate(auc.status === "settled" ? `/auction/result/${auc.id}` : `/auction/${auc.id}`)}
                      >
                        {(() => {
                          const col = TYPE_COLOR_MAP[auc.type] || "#ff9500";
                          return (
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: `${col}14`, border: `1px solid ${col}30` }}>
                              <Gavel className="w-5 h-5" style={{ color: col }} />
                            </div>
                          );
                        })()}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[14px] font-semibold text-foreground truncate">
                              {auc.dealName || `${meta.label} Auction`}
                            </span>
                            {roleTag && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
                                style={{
                                  background: isWinner ? "rgba(48,209,88,0.12)" : isSeller ? "rgba(10,132,255,0.12)" : "rgba(255,255,255,0.1)",
                                  color: isWinner ? "#30d158" : isSeller ? "#0a84ff" : "hsl(var(--foreground))",
                                  border: isWinner ? "1px solid rgba(48,209,88,0.2)" : isSeller ? "1px solid rgba(10,132,255,0.2)" : "1px solid rgba(255,255,255,0.15)"
                                }}>
                                {roleTag}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 text-[11px] text-foreground/30">
                              <Calendar className="w-3 h-3" />
                              {timeAgo(auc.createdAt)}
                            </div>
                            {auc.seller?.address && (
                              <div className="flex items-center gap-1 text-[11px] text-foreground/25 font-mono">
                                <span className="text-[10px] text-foreground/30">Seller:</span>
                                {shortAddress(auc.seller.address)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Result */}
                        <div className="shrink-0 text-right">
                          {auc.result?.matched && auc.result?.agreedPrice && (isSeller || isWinner) ? (
                            <div className="text-[15px] font-bold sf-display" style={{ color: "#30d158" }}>
                              ${auc.result.agreedPrice}{meta.unit}
                            </div>
                          ) : auc.result?.matched && isBidder && !isWinner ? (
                            <div className="text-[11px] font-bold text-foreground/30">
                              Settled
                            </div>
                          ) : null}
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusCol }} />
                            <span className="text-[11px] font-semibold" style={{ color: statusCol }}>
                              {statusText}
                            </span>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-foreground/20 group-hover:text-foreground/40 transition-colors shrink-0" />
                      </motion.div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* ── Contract Info ────────────────────────────────── */}
          <div className="apple-card p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/30">Contracts</p>
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
              <span className="text-[12px] text-foreground/40">MultiPartyAuction</span>
              <a href={`https://sepolia.basescan.org/address/${MULTI_PARTY_AUCTION_ADDRESS}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[11px] text-[#0a84ff] hover:underline">
                {MULTI_PARTY_AUCTION_ADDRESS.slice(0, 10)}… <ExternalLink className="w-3 h-3" />
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
              <span className="text-[12px] text-foreground/70">Fhenix CoFHE (euint64, euint32)</span>
            </div>
          </div>

          {/* Start new buttons */}
          <div className="flex gap-3">
            <button onClick={() => navigate("/create")}
              className="btn-apple flex-1 py-3.5 text-[14px] flex items-center justify-center gap-2">
              New Negotiation <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => navigate("/auction/create")}
              style={{ background: "linear-gradient(135deg, #ff9500, #ff5e00)", border: "none" }}
              className="btn-apple flex-1 py-3.5 text-[14px] flex items-center justify-center gap-2 text-white">
              New Auction <Gavel className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
