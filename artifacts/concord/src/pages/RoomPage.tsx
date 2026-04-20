import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, Zap, CheckCircle2, XCircle, ArrowRight, Wallet,
  Copy, Check, ShieldCheck, Users, AlertCircle, Hash,
} from "lucide-react";
import { useAccount, usePublicClient, useWalletClient, useWriteContract, useReadContract } from "wagmi";
import { useModal } from "connectkit";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";
import { getRoom, saveRoom, NEGOTIATION_TYPES, type Room } from "@/lib/concord";
import { encryptPrice, initFHE, formatCtHash } from "@/lib/fhe";
import { BLIND_NEGOTIATION_ABI, BLIND_NEGOTIATION_ADDRESS, getExplorerTxUrl, roomIdToCode } from "@/lib/contracts";

// Display code derived from the on-chain roomIdHex

type FeedEventType =
  | { kind: "seller_submitted"; ciphertextPreview: string; ts: number }
  | { kind: "waiting_buyer"; isViewerBuyer?: boolean; ts: number }
  | { kind: "buyer_submitted"; ciphertextPreview: string; ts: number }
  | { kind: "computing"; step: string; ts: number }
  | { kind: "result_matched"; agreedPrice: string; ts: number }
  | { kind: "result_no_match"; ts: number };

const COMPUTE_OPS = [
  "Encrypting your price…",
  "Submitting to the network…",
  "Comparing prices securely…",
  "Computing result…",
];

function timeLabel(ts: number) {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.round(diff / 60)}m ago`;
}

function FeedBubble({ event, index }: { event: FeedEventType; index: number }) {
  const isSeller = event.kind === "seller_submitted";
  const isBuyer = event.kind === "buyer_submitted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.38, delay: index * 0.04, ease: [0.32, 0, 0, 1] }}
      className={`flex w-full ${isBuyer ? "justify-end" : "justify-start"}`}
    >
      {isSeller && (
        <div className="max-w-[78%] flex items-end gap-2.5">
          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold bg-[rgba(10,132,255,0.15)] text-[#0a84ff] border border-[rgba(10,132,255,0.25)] mb-0.5">A</div>
          <div>
            <div className="rounded-2xl rounded-bl-md px-4 py-3" style={{ background: "hsl(var(--card))", border: "0.5px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-3.5 h-3.5 text-[#0a84ff]" />
                <span className="text-[13px] font-semibold text-foreground">Party A sealed their floor price</span>
              </div>
              <div className="font-mono text-[10px] text-[#0a84ff]/60 break-all leading-relaxed">{event.ciphertextPreview}</div>
              <div className="mt-2 text-[11px] text-foreground/25 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                On-chain euint64 — visible to nobody
              </div>
            </div>
            <div className="text-[10px] text-foreground/20 mt-1 ml-1">{timeLabel(event.ts)}</div>
          </div>
        </div>
      )}

      {isBuyer && (
        <div className="max-w-[78%] flex items-end gap-2.5 flex-row-reverse">
          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold bg-[rgba(90,200,250,0.12)] text-[#5ac8fa] border border-[rgba(90,200,250,0.2)] mb-0.5">B</div>
          <div>
            <div className="rounded-2xl rounded-br-md px-4 py-3" style={{ background: "rgba(10,132,255,0.12)", border: "0.5px solid rgba(10,132,255,0.2)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-3.5 h-3.5 text-[#5ac8fa]" />
                <span className="text-[13px] font-semibold text-foreground">Party B submitted their ceiling</span>
              </div>
              <div className="font-mono text-[10px] text-[#5ac8fa]/60 break-all leading-relaxed">{event.ciphertextPreview}</div>
              <div className="mt-2 text-[11px] text-foreground/25 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                On-chain euint64 — visible to nobody
              </div>
            </div>
            <div className="text-[10px] text-foreground/20 mt-1 mr-1 text-right">{timeLabel(event.ts)}</div>
          </div>
        </div>
      )}

      {event.kind === "waiting_buyer" && (
        <div className="w-full flex justify-center my-1">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[#ffd60a] gentle-pulse" />
            <span className="text-[12px] text-foreground/40">
              {event.isViewerBuyer ? "You joined. Waiting for your price submission…" : "Waiting for counterparty to join…"}
            </span>
          </div>
        </div>
      )}

      {event.kind === "computing" && (
        <div className="w-full flex justify-center my-0.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-[#0a84ff]/30 border-t-[#0a84ff] rounded-full animate-spin" />
            <span className="text-[12px] text-foreground/40">{event.step}</span>
          </div>
        </div>
      )}

      {event.kind === "result_matched" && (
        <div className="w-full flex justify-center my-2">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="rounded-2xl px-6 py-5 text-center max-w-sm"
            style={{ background: "linear-gradient(135deg, rgba(48,209,88,0.1) 0%, rgba(10,132,255,0.08) 100%)", border: "1px solid rgba(48,209,88,0.25)" }}
          >
            <CheckCircle2 className="w-8 h-8 text-[#30d158] mx-auto mb-2" strokeWidth={1.75} />
            <div className="text-[13px] text-foreground/50 mb-1">Deal Found — Agreed Price</div>
            <div className="sf-display text-[40px] leading-none text-[#30d158]">{event.agreedPrice}</div>
            <div className="mt-3 text-[11px] text-foreground/25 flex items-center justify-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              Neither party's number was ever revealed
            </div>
          </motion.div>
        </div>
      )}

      {event.kind === "result_no_match" && (
        <div className="w-full flex justify-center my-2">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="rounded-2xl px-6 py-5 text-center max-w-sm"
            style={{ background: "rgba(255,69,58,0.06)", border: "1px solid rgba(255,69,58,0.2)" }}
          >
            <XCircle className="w-8 h-8 text-[#ff453a] mx-auto mb-2" strokeWidth={1.75} />
            <div className="text-[15px] font-semibold text-foreground mb-1">No Overlap</div>
            <div className="text-[12px] text-foreground/35">Prices didn't overlap. Zero information leaked.</div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

export default function RoomPage() {
  const [, params] = useRoute("/room/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";

  const { address: walletAddr, isConnected: walletConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { setOpen: openWalletModal } = useModal();
  const { writeContractAsync } = useWriteContract();

  const [room, setRoom] = useState<Room | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [feed, setFeed] = useState<FeedEventType[]>([]);
  const [price, setPrice] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "encrypting" | "computing" | "done">("idle");
  const [codeCopied, setCodeCopied] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const roomCode = id.startsWith("0x") ? roomIdToCode(id as `0x${string}`) : id.replace(/-/g, "").toUpperCase().slice(0, 3) + "·" + id.replace(/-/g, "").toUpperCase().slice(3, 6);

  // Query on-chain room info — polls every 8s to detect buyer joining
  const { data: onChainInfo } = useReadContract({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    functionName: "getRoomInfo",
    args: id.startsWith("0x") ? [id as `0x${string}`] : undefined,
    query: {
      enabled: id.startsWith("0x"),
      refetchInterval: 8000, // Poll every 8 seconds for real-time buyer detection
    },
  });

  const NEG_TYPE_MAP: Record<number, keyof typeof NEGOTIATION_TYPES> = { 0: "ma", 1: "salary", 2: "realestate", 3: "custom" };

  useEffect(() => {
    if (!id) return;
    const r = getRoom(id);
    const zeroAddr = "0x0000000000000000000000000000000000000000";

    // If on-chain data is available, always check for updates (buyer joining)
    if (id.startsWith("0x") && onChainInfo) {
      const [partyA, partyB, status, createdAt, deadline, negType, isResultPublished, onChainMatched, onChainPrice] = onChainInfo as [string, string, number, bigint, bigint, number, boolean, boolean, bigint];
      const negKey = NEG_TYPE_MAP[negType] ?? "custom";
      const meta = NEGOTIATION_TYPES[negKey];

      // Map on-chain RoomStatus enum (0=Open, 1=PendingB, 2=Computing, 3=Settled, 4=Expired)
      const statusMap: Record<number, Room["status"]> = { 0: "pending_b", 1: "pending_b", 2: "pending_b", 3: "settled", 4: "settled" };

      const enrichedRoom: Room = {
        ...(r || {}), // preserve local fields like txHash, label overrides
        id,
        roomIdHex: id,
        type: r?.type ?? negKey,
        label: r?.label ?? meta.label,
        status: statusMap[status] ?? "pending_b",
        partyA: partyA !== zeroAddr ? { address: partyA, timestamp: r?.partyA?.timestamp ?? Number(createdAt) * 1000 } : r?.partyA,
        partyB: partyB !== zeroAddr ? { address: partyB, timestamp: r?.partyB?.timestamp ?? Date.now() } : r?.partyB,
        createdAt: r?.createdAt ?? Number(createdAt) * 1000,
        deadline: r?.deadline ?? Number(deadline) * 1000,
        txHash: r?.txHash,
        result: isResultPublished ? {
          matched: onChainMatched,
          agreedPrice: Number(onChainPrice) > 0 ? Number(onChainPrice) : undefined,
          timestamp: Date.now(),
          txHash: r?.result?.txHash ?? r?.txHash ?? "",
        } : r?.result,
      };

      // Only update if something actually changed
      const hasNewPartyB = partyB !== zeroAddr && !r?.partyB;
      if (hasNewPartyB || !r?.partyA) {
        saveRoom(enrichedRoom);
      }
      setRoom(enrichedRoom);
      rebuildFeed(enrichedRoom);
      return;
    }

    // Fall back to local room data
    if (r) {
      setRoom(r);
      rebuildFeed(r);
      return;
    }

    // No local room and no on-chain data — not found (unless still loading)
    if (!id.startsWith("0x")) {
      setNotFound(true);
    }
  }, [id, onChainInfo, walletAddr]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed]);

  function rebuildFeed(r: Room) {
    const events: FeedEventType[] = [];
    if (r.partyA) {
      events.push({ kind: "seller_submitted", ciphertextPreview: r.txHash ? `tx: ${r.txHash.slice(0, 16)}…` : "encrypted on-chain", ts: r.partyA.timestamp });
    }
    if (r.status === "pending_b" && !r.partyB) {
      const viewerIsBuyer = walletAddr && r.partyA?.address?.toLowerCase() !== walletAddr.toLowerCase();
      events.push({ kind: "waiting_buyer", isViewerBuyer: !!viewerIsBuyer, ts: Date.now() });
    }
    if (r.partyB) {
      events.push({ kind: "buyer_submitted", ciphertextPreview: "encrypted ceiling submitted on-chain", ts: r.partyB.timestamp });
    }
    if (r.result) {
      const meta = NEGOTIATION_TYPES[r.type];
      if (r.result.matched) {
        const priceDisplay = r.result.agreedPrice ? `$${r.result.agreedPrice}${meta.unit}` : "Decrypting…";
        events.push({ kind: "result_matched", agreedPrice: priceDisplay, ts: r.result.timestamp });
      } else {
        events.push({ kind: "result_no_match", ts: r.result.timestamp });
      }
    }
    setFeed(events);
  }

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  };

  const isPartyA = room?.partyA?.address?.toLowerCase() === walletAddr?.toLowerCase();
  const meta = room ? NEGOTIATION_TYPES[room.type] : null;
  const parsedPrice = parseFloat(price);
  const isValid = !isNaN(parsedPrice) && parsedPrice > 0;

  const handleSubmit = async () => {
    if (!room || !isValid || !walletConnected || isPartyA || !publicClient || !walletClient) return;
    setSubmitStatus("encrypting");

    try {
      // 1. Initialize FHE
      await initFHE(publicClient, walletClient);

      // 2. Encrypt ceiling price with real CoFHE
      const encrypted = await encryptPrice(BigInt(Math.round(parsedPrice)));
      setSubmitStatus("computing");

      // 3. Stream compute steps for UI
      for (const op of COMPUTE_OPS) {
        await new Promise(r => setTimeout(r, 200));
        setFeed(prev => [...prev.filter(e => e.kind !== "waiting_buyer"), { kind: "computing", step: op, ts: Date.now() }]);
      }

      // 4. Send on-chain joinAndCompute transaction
      const hash = await writeContractAsync({
        address: BLIND_NEGOTIATION_ADDRESS,
        abi: BLIND_NEGOTIATION_ABI,
        functionName: "joinAndCompute",
        args: [room.roomIdHex as `0x${string}`, encrypted.encryptedInput],
      });

      // 5. Add buyer submitted event
      setFeed(prev => [...prev.filter(e => e.kind !== "waiting_buyer"), {
        kind: "buyer_submitted",
        ciphertextPreview: `tx: ${hash.slice(0, 20)}…`,
        ts: Date.now(),
      }]);

      // 6. Update room state
      const updatedRoom: Room = {
        ...room,
        partyB: { address: walletAddr!, timestamp: Date.now() },
        status: "settled",
        result: {
          matched: true,  // Will be resolved by decryptForView on ResultPage
          timestamp: Date.now(),
          txHash: hash,
        },
      };
      saveRoom(updatedRoom);
      setRoom(updatedRoom);

      // 7. Show result indicator
      setFeed(prev => [...prev, { kind: "result_matched", agreedPrice: "Decrypting…", ts: Date.now() }]);
      setSubmitStatus("done");
    } catch (error) {
      console.error("[RoomPage] Submit error:", error);
      setSubmitStatus("idle");
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-center">
        <NavBar />
        <div>
          <AlertCircle className="w-10 h-10 text-foreground/20 mx-auto mb-4" />
          <h2 className="sf-display text-[24px] text-foreground mb-1.5">Room Not Found</h2>
          <p className="text-[14px] text-foreground/40 mb-6">This negotiation room doesn't exist or has expired.</p>
          <button onClick={() => navigate("/create")} className="btn-apple px-6 py-2.5 text-[14px]">Create a Room</button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <NavBar />
        <div className="w-5 h-5 border-2 border-white/15 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  const isSettled = room.status === "settled";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />

      <div className="flex-1 flex flex-col pt-12 max-w-2xl mx-auto w-full concord-page">
        {/* Room header */}
        <div className="py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <FHEBadge size="sm" label="Fhenix CoFHE" />
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(10,132,255,0.08)", color: "#0a84ff", border: "1px solid rgba(10,132,255,0.2)" }}>
                  Base Sepolia
                </span>
                <span
                  className="text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0"
                  style={isSettled
                    ? { background: "rgba(48,209,88,0.1)", color: "#30d158" }
                    : { background: "rgba(255,214,10,0.1)", color: "#ffd60a" }
                  }
                >
                  {isSettled ? "Settled" : "Active"}
                </span>
              </div>
              <h1 className="sf-headline text-[16px] text-foreground truncate">{room.label}</h1>
              <p className="font-mono text-[9px] text-foreground/20 mt-0.5 truncate">#{id}</p>
              {room.txHash && (
                <a href={getExplorerTxUrl(room.txHash as `0x${string}`)} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-[#0a84ff]/50 hover:text-[#0a84ff] mt-0.5 block">
                  View on BaseScan ↗
                </a>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border ${
                room.partyA ? "bg-[rgba(10,132,255,0.15)] border-[rgba(10,132,255,0.3)] text-[#0a84ff]" : "bg-white/5 border-white/10 text-foreground/30"
              }`}>A</div>
              <div className="w-3 h-px bg-white/15" />
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border ${
                room.partyB ? "bg-[rgba(90,200,250,0.12)] border-[rgba(90,200,250,0.25)] text-[#5ac8fa]" : "bg-white/5 border-white/10 text-foreground/30"
              }`}>B</div>
            </div>
          </div>

          {!isSettled && (
            <div className="mt-3 flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: "rgba(10,132,255,0.05)", border: "1px solid rgba(10,132,255,0.12)" }}>
              <Hash className="w-3.5 h-3.5 text-foreground/25 shrink-0" />
              <span className="font-mono text-[14px] font-bold text-foreground tracking-widest">{roomCode}</span>
              <span className="text-[11px] text-foreground/25">room code</span>
              <button
                onClick={copyCode}
                className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold transition-colors"
                style={{ color: codeCopied ? "#30d158" : "#0a84ff" }}
              >
                {codeCopied ? <><Check className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy code</>}
              </button>
            </div>
          )}
        </div>

        {/* Chat feed */}
        <div className="flex-1 overflow-y-auto py-6 space-y-3 min-h-0" style={{ maxHeight: "calc(100vh - 340px)" }}>
          <AnimatePresence initial={false}>
            {feed.map((event, i) => (
              <FeedBubble key={`${event.kind}-${i}`} event={event} index={i} />
            ))}
          </AnimatePresence>
          <div ref={feedEndRef} />
        </div>

        {/* Bottom input panel */}
        <div className="border-t py-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {isSettled && (
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/result/${id}`)}
                className="btn-apple flex-1 py-3 text-[14px] flex items-center justify-center gap-2"
              >
                View Full Result
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate("/create")}
                className="btn-ghost px-5 py-3 text-[14px]"
              >
                New Room
              </button>
            </div>
          )}

          {!isSettled && room.partyA && !room.partyB && (
            <div>
              {walletConnected && isPartyA ? (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <Users className="w-4 h-4 text-foreground/20 shrink-0" />
                  <div>
                    <p className="text-[13px] text-foreground/45">Share your room code with the counterparty</p>
                    <p className="text-[11px] text-foreground/22 mt-0.5">They enter it at /join — or check their On-Chain Inbox if you sent them an invite</p>
                  </div>
                </div>
              ) : !walletConnected ? (
                <button
                  onClick={() => openWalletModal(true)}
                  className="btn-ghost w-full py-3.5 text-[14px] flex items-center justify-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  Connect Wallet to Join as Party B
                </button>
              ) : null}
            </div>
          )}

          {!isSettled && room.partyA && !room.partyB && walletConnected && !isPartyA && submitStatus === "idle" && (
            <div className="space-y-3">
              <div className="text-[12px] text-foreground/35 text-center">Enter your maximum price — it will be FHE-encrypted and submitted on-chain</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/35 text-[15px]">$</span>
                  <input
                    type="number"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder={meta?.placeholder}
                    className="apple-input w-full py-3.5 pl-8 pr-3 text-[15px]"
                    onKeyDown={e => e.key === "Enter" && isValid && handleSubmit()}
                  />
                </div>
                {meta?.unit && <span className="text-[13px] text-foreground/30 font-mono shrink-0">{meta.unit}</span>}
                <button
                  onClick={handleSubmit}
                  disabled={!isValid}
                  className="btn-apple shrink-0 px-5 py-3.5 text-[14px] flex items-center gap-2 disabled:opacity-30"
                >
                  <Lock className="w-4 h-4" />
                  Submit
                </button>
              </div>
            </div>
          )}

          {(submitStatus === "encrypting" || submitStatus === "computing") && (
            <div className="flex items-center justify-center gap-2.5 py-3">
              <div className="w-4 h-4 border-2 border-[#0a84ff]/30 border-t-[#0a84ff] rounded-full animate-spin" />
              <span className="text-[13px] text-foreground/50">
                {submitStatus === "encrypting" ? "Encrypting your price…" : "Processing on-chain…"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



