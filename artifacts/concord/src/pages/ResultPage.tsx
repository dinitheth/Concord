import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, ArrowRight, Lock, RefreshCw, ExternalLink, AlertCircle, ShieldCheck } from "lucide-react";
import NavBar from "@/components/NavBar";
import { getRoom, saveRoom, NEGOTIATION_TYPES, type Room } from "@/lib/concord";
import { getExplorerTxUrl, BLIND_NEGOTIATION_ADDRESS, BLIND_NEGOTIATION_ABI } from "@/lib/contracts";
import { useReadContract } from "wagmi";

export default function ResultPage() {
  const [, params] = useRoute("/result/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const [room, setRoom] = useState<Room | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Read on-chain room info — includes status, published result data
  const { data: onChainInfo, isLoading: isOnChainLoading } = useReadContract({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    functionName: "getRoomInfo",
    args: id.startsWith("0x") ? [id as `0x${string}`] : undefined,
    query: {
      enabled: id.startsWith("0x"),
      refetchInterval: 5000,
    },
  });

  // Load local room data
  useEffect(() => {
    if (!id) return;
    const r = getRoom(id);
    if (r) setRoom(r);
  }, [id]);

  // Merge on-chain data with local room data
  useEffect(() => {
    if (!onChainInfo || !id.startsWith("0x")) return;

    const [partyA, partyB, status, createdAt, deadline, negType, isResultPublished, onChainMatched, onChainPrice] =
      onChainInfo as [string, string, number, bigint, bigint, number, boolean, boolean, bigint];

    const localRoom = getRoom(id) || room;
    const negKey = (["ma", "salary", "realestate", "custom"] as const)[negType] || "custom";
    const zeroAddr = "0x0000000000000000000000000000000000000000";

    // Build the most complete room object from on-chain + local data
    const updatedRoom: Room = {
      ...(localRoom || {
        id,
        roomIdHex: id,
        type: negKey,
        label: NEGOTIATION_TYPES[negKey].label,
        createdAt: Number(createdAt) * 1000,
        deadline: Number(deadline) * 1000,
      }),
      status: status >= 3 ? "settled" : "pending_b",
      partyA: partyA !== zeroAddr
        ? { address: partyA, timestamp: localRoom?.partyA?.timestamp ?? Number(createdAt) * 1000 }
        : localRoom?.partyA,
      partyB: partyB !== zeroAddr
        ? { address: partyB, timestamp: localRoom?.partyB?.timestamp ?? Date.now() }
        : localRoom?.partyB,
    };

    // Determine result
    if (isResultPublished) {
      // Published on-chain — use those values
      updatedRoom.result = {
        matched: onChainMatched,
        agreedPrice: onChainMatched && Number(onChainPrice) > 0 ? Number(onChainPrice) : undefined,
        timestamp: Date.now(),
        txHash: localRoom?.result?.txHash,
      };
    } else if (status >= 3) {
      // Settled (FHE comparison ran) but not published — show as matched
      updatedRoom.result = localRoom?.result || {
        matched: true,
        timestamp: Date.now(),
        txHash: localRoom?.txHash,
      };
    }

    saveRoom(updatedRoom);
    setRoom(updatedRoom);
    setLoading(false);
    setTimeout(() => setRevealed(true), 400);
  }, [onChainInfo, id]);

  // If still loading
  if (loading && isOnChainLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <NavBar />
        <RefreshCw className="w-8 h-8 text-[#0a84ff] animate-spin" />
        <div className="text-[14px] text-foreground/40 font-medium">Loading result…</div>
      </div>
    );
  }

  // No room found
  if (!room) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <NavBar />
        <AlertCircle className="w-10 h-10 text-foreground/20" />
        <div className="text-[14px] text-foreground/40 font-medium">Room not found</div>
        <button onClick={() => navigate("/create")} className="btn-apple px-6 py-2.5 text-[14px]">
          Create a Room
        </button>
      </div>
    );
  }

  const meta = NEGOTIATION_TYPES[room.type];
  const isSettled = room.status === "settled";
  const hasResult = !!room.result;
  const matched = room.result?.matched ?? true;
  const agreedPrice = room.result?.agreedPrice;
  const txHash = room.result?.txHash || room.txHash;
  const displayPrice = agreedPrice ? `$${agreedPrice}${meta.unit}` : null;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-16 px-6 max-w-xl mx-auto">
        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.32, 0, 0, 1] }}
              className="pt-12 space-y-5"
            >
              {/* Result header */}
              <div className="text-center mb-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 220, damping: 18 }}
                  className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center"
                  style={matched
                    ? { background: "rgba(48,209,88,0.1)", border: "1px solid rgba(48,209,88,0.3)" }
                    : { background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.2)" }
                  }
                >
                  {matched
                    ? <CheckCircle2 className="w-10 h-10 text-[#30d158]" strokeWidth={1.75} />
                    : <XCircle className="w-10 h-10 text-[#ff453a]" strokeWidth={1.75} />
                  }
                </motion.div>
                <h1 className="sf-display text-[28px] sm:text-[36px] text-foreground mb-2">
                  {matched ? "Prices Compared" : "No Overlap"}
                </h1>
                <p className="text-[15px] text-foreground/40 max-w-sm mx-auto leading-relaxed">
                  {matched
                    ? "Both prices were submitted and compared using fully homomorphic encryption. The computation ran entirely in encrypted space. Neither party's number was ever revealed."
                    : "Your prices didn't overlap. Neither party's number was revealed. Zero information leaked."}
                </p>
              </div>

              {/* Agreed price — show if published, otherwise show encrypted status */}
              {matched && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 150, damping: 16 }}
                  className="apple-card p-8 text-center"
                  style={{ background: "var(--green-subtle-bg)", borderColor: "var(--green-subtle-border)" }}
                >
                  {displayPrice ? (
                    <>
                      <p className="text-[12px] font-semibold text-[#30d158]/60 uppercase tracking-widest mb-3">Agreed Price</p>
                      <div className="sf-display text-[40px] sm:text-[52px] md:text-[64px] leading-none text-foreground mb-3" style={{ color: "#30d158" }}>
                        {displayPrice}
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-[12px] text-foreground/25">
                        <Lock className="w-3 h-3" />
                        <span>Decrypted midpoint, computed in encrypted space</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] font-semibold text-[#30d158]/60 uppercase tracking-widest mb-3">FHE Comparison Complete</p>
                      <div className="flex items-center justify-center gap-2 mb-3">
                        <ShieldCheck className="w-8 h-8 text-[#30d158]" strokeWidth={1.5} />
                      </div>
                      <p className="text-[14px] text-foreground/50 mb-2">
                        Prices were compared on-chain using Fhenix CoFHE
                      </p>
                      <div className="flex items-center justify-center gap-1.5 text-[12px] text-foreground/25">
                        <Lock className="w-3 h-3" />
                        <span>Result exists in encrypted form on Base Sepolia</span>
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* Privacy + verification */}
              <div className="apple-card p-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-foreground/40">Privacy</span>
                    <span className="text-[13px] text-[#30d158] font-semibold">Neither price was revealed</span>
                  </div>
                  <div style={{ height: 1, background: "var(--divider)" }} />
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-foreground/40">Encryption</span>
                    <span className="text-[13px] text-foreground/70">Fhenix CoFHE (euint64)</span>
                  </div>
                  <div style={{ height: 1, background: "var(--divider)" }} />
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-foreground/40">Network</span>
                    <span className="text-[13px] text-foreground/70">Base Sepolia</span>
                  </div>
                  <div style={{ height: 1, background: "var(--divider)" }} />
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-foreground/40">Status</span>
                    <span className="text-[13px] font-semibold" style={{ color: isSettled ? "#30d158" : "#ffd60a" }}>
                      {isSettled ? "Settled" : "In Progress"}
                    </span>
                  </div>
                  {txHash && (
                    <>
                      <div style={{ height: 1, background: "var(--divider)" }} />
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] text-foreground/40">Transaction</span>
                        <a
                          href={getExplorerTxUrl(txHash as `0x${string}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-mono text-[#0a84ff] hover:underline flex items-center gap-1"
                        >
                          {txHash.slice(0, 12)}… <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Settlement */}
              {matched && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="apple-card p-5"
                  style={{ borderColor: "rgba(48,209,88,0.15)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[12px] font-semibold text-foreground/40 uppercase tracking-widest">Settlement</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,214,10,0.08)", color: "#ffd60a", border: "1px solid rgba(255,214,10,0.15)" }}>Coming Soon</span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-foreground sf-headline mb-1.5">ConfidentialEscrow</h3>
                  <p className="text-[13px] text-foreground/40 leading-relaxed mb-3">
                    Lock the agreed amount in an on-chain escrow powered by Fhenix CoFHE. The value stays encrypted, even the contract can't read it.
                  </p>
                  <button
                    disabled
                    className="btn-apple-secondary text-[13px] px-4 py-2 flex items-center gap-2 w-full justify-center opacity-40 cursor-not-allowed"
                  >
                    Create Escrow
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() => navigate("/create")}
                  className="btn-apple py-3.5 text-[15px] flex items-center justify-center gap-2"
                >
                  New Negotiation
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate("/")}
                  className="btn-ghost py-3.5 text-[15px] flex items-center justify-center"
                >
                  Back Home
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
