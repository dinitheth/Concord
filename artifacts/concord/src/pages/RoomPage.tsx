import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, Zap, CheckCircle2, XCircle, ArrowRight, Wallet,
  Copy, Check, ShieldCheck, Users, AlertCircle, Hash, RefreshCw,
  FileText, X,
} from "lucide-react";
import { useAccount, usePublicClient, useWalletClient, useReadContract } from "wagmi";
import { useModal } from "connectkit";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";
import { getRoom, saveRoom, NEGOTIATION_TYPES, type Room, type PriceUnit, normalizeToDefaultUnit } from "@/lib/concord";
import { encryptPrice, initFHE, formatCtHash } from "@/lib/fhe";
import { BLIND_NEGOTIATION_ABI, BLIND_NEGOTIATION_ADDRESS, getExplorerTxUrl, roomIdToCode } from "@/lib/contracts";

// Display code derived from the on-chain roomIdHex

type FeedEventType =
  | { kind: "initiator_submitted"; ciphertextPreview: string; ts: number }
  | { kind: "waiting_counterparty"; isViewerCounterparty?: boolean; ts: number }
  | { kind: "counterparty_submitted"; ciphertextPreview: string; ts: number }
  | { kind: "computing"; step: string; ts: number }
  | { kind: "result_matched"; agreedPrice: string; ts: number }
  | { kind: "result_no_match"; ts: number };

function timeLabel(ts: number) {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.round(diff / 60)}m ago`;
}

function FeedBubble({ event, index, creatorRole }: { event: FeedEventType; index: number; creatorRole?: "seller" | "buyer" }) {
  const isInitiator = event.kind === "initiator_submitted";
  const isCounterparty = event.kind === "counterparty_submitted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.38, delay: index * 0.04, ease: [0.32, 0, 0, 1] }}
      className={`flex w-full ${isCounterparty ? "justify-end" : "justify-start"}`}
    >
      {isInitiator && (
        <div className="max-w-[78%] flex items-end gap-2.5">
          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold bg-[rgba(10,132,255,0.15)] text-[#0a84ff] border border-[rgba(10,132,255,0.25)] mb-0.5">A</div>
          <div>
            <div className="rounded-2xl rounded-bl-md px-4 py-3" style={{ background: "hsl(var(--card))", border: "0.5px solid var(--card-border-color)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-3.5 h-3.5 text-[#0a84ff]" />
                <span className="text-[13px] font-semibold text-foreground">
                  Party A sealed their {creatorRole === "buyer" ? "ceiling" : "floor"} price
                </span>
              </div>
              <div className="font-mono text-[10px] text-[#0a84ff]/60 break-all leading-relaxed">{event.ciphertextPreview}</div>
              <div className="mt-2 text-[11px] text-foreground/25 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                On-chain euint64, visible to nobody
              </div>
            </div>
            <div className="text-[10px] text-foreground/20 mt-1 ml-1">{timeLabel(event.ts)}</div>
          </div>
        </div>
      )}

      {isCounterparty && (
        <div className="max-w-[78%] flex items-end gap-2.5 flex-row-reverse">
          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold bg-[rgba(90,200,250,0.12)] text-[#5ac8fa] border border-[rgba(90,200,250,0.25)] mb-0.5">B</div>
          <div>
            <div className="rounded-2xl rounded-br-md px-4 py-3" style={{ background: "rgba(10,132,255,0.12)", border: "0.5px solid rgba(10,132,255,0.2)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-3.5 h-3.5 text-[#5ac8fa]" />
                <span className="text-[13px] font-semibold text-foreground">
                  Party B submitted their {creatorRole === "buyer" ? "floor" : "ceiling"} price
                </span>
              </div>
              <div className="font-mono text-[10px] text-[#5ac8fa]/60 break-all leading-relaxed">{event.ciphertextPreview}</div>
              <div className="mt-2 text-[11px] text-foreground/25 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                On-chain euint64, visible to nobody
              </div>
            </div>
            <div className="text-[10px] text-foreground/20 mt-1 mr-1 text-right">{timeLabel(event.ts)}</div>
          </div>
        </div>
      )}

      {event.kind === "waiting_counterparty" && (
        <div className="w-full flex justify-center my-1">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: "var(--subtle-bg)", border: "0.5px solid var(--card-border-color)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[#ffd60a] gentle-pulse" />
            <span className="text-[12px] text-foreground/40">
              {event.isViewerCounterparty ? "You joined. Submit your price below." : "Waiting for counterparty to submit their price…"}
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
            <div className="text-[13px] text-foreground/50 mb-1">Deal Found. Agreed Price</div>
            <div className="sf-display text-[28px] sm:text-[36px] md:text-[40px] leading-none text-[#30d158]">{event.agreedPrice}</div>
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

  const [room, setRoom] = useState<Room | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [feed, setFeed] = useState<FeedEventType[]>([]);
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("M");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "encrypting" | "computing" | "done" | "error">("idle");
  const [encryptStep, setEncryptStep] = useState("");
  const [encryptError, setEncryptError] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [showDealDetails, setShowDealDetails] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const roomCode = id.startsWith("0x") ? roomIdToCode(id as `0x${string}`) : id.replace(/-/g, "").toUpperCase().slice(0, 3) + "·" + id.replace(/-/g, "").toUpperCase().slice(3, 6);
  const isPartyA = room?.partyA?.address?.toLowerCase() === walletAddr?.toLowerCase();
  const meta = room ? NEGOTIATION_TYPES[room.type] : null;

  // Query on-chain room info — polls every 8s to detect counterparty joining
  const { data: onChainInfo } = useReadContract({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    functionName: "getRoomInfo",
    args: id.startsWith("0x") ? [id as `0x${string}`] : undefined,
    query: {
      enabled: id.startsWith("0x"),
      refetchInterval: 8000, // Poll every 8 seconds for real-time counterparty detection
    },
  });

  // Query on-chain room metadata
  const { data: onChainMetadata } = useReadContract({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    functionName: "roomMetadata",
    args: id.startsWith("0x") ? [id as `0x${string}`] : undefined,
    query: {
      enabled: id.startsWith("0x"),
    },
  });

  let parsedMetadata: any = null;
  if (onChainMetadata && typeof onChainMetadata === "string" && onChainMetadata.trim() !== "") {
    try {
      parsedMetadata = JSON.parse(onChainMetadata);
    } catch (e) {
      console.warn("Failed to parse on-chain metadata:", e);
    }
  }

  const fallbackMetadata = room ? {
    type: room.type,
    label: room.label,
    dealName: room.dealName,
    dealDesc: room.dealDesc,
    selectedTerms: room.selectedTerms,
    deadline: room.deadlineStr,
    displayName: room.displayName,
    creatorRole: room.creatorRole,
    dashboardData: room.dashboardData,
    dashboardFields: room ? NEGOTIATION_TYPES[room.type]?.dashboardFields : [],
  } : null;

  const metadataToShow = parsedMetadata || fallbackMetadata;

  const NEG_TYPE_MAP: Record<number, keyof typeof NEGOTIATION_TYPES> = { 0: "ma", 1: "salary", 2: "realestate", 3: "custom" };

  useEffect(() => {
    if (!id) return;
    if (localStorage.getItem("concord_last_room") === id) {
      localStorage.removeItem("concord_last_room");
    }
    const r = getRoom(id);
    const zeroAddr = "0x0000000000000000000000000000000000000000";

    // If on-chain data is available, always check for updates (counterparty joining)
    if (id.startsWith("0x") && onChainInfo) {
      const [partyA, partyB, status, createdAt, deadline, negType, isResultPublished, onChainMatched, onChainPrice] = onChainInfo as [string, string, number, bigint, bigint, number, boolean, boolean, bigint];
      const creatorRole = negType >= 10 ? "buyer" : "seller";
      const baseNegType = negType % 10;
      const negKey = NEG_TYPE_MAP[baseNegType] ?? "custom";
      const meta = NEGOTIATION_TYPES[negKey];

      // Map on-chain RoomStatus enum (0=Open, 1=PendingB, 2=Computing, 3=Settled, 4=Expired)
      const statusMap: Record<number, Room["status"]> = { 0: "pending_b", 1: "pending_b", 2: "pending_b", 3: "settled", 4: "settled" };

      const enrichedRoom: Room = {
        ...(r || {}), // preserve local fields like txHash, label overrides
        id,
        roomIdHex: id,
        type: r?.type ?? parsedMetadata?.type ?? negKey,
        label: r?.label ?? parsedMetadata?.label ?? meta.label,
        status: statusMap[status] ?? "pending_b",
        partyA: partyA !== zeroAddr ? { address: partyA, timestamp: r?.partyA?.timestamp ?? Number(createdAt) * 1000 } : r?.partyA,
        partyB: partyB !== zeroAddr ? { address: partyB, timestamp: r?.partyB?.timestamp ?? Date.now() } : r?.partyB,
        createdAt: r?.createdAt ?? Number(createdAt) * 1000,
        deadline: r?.deadline ?? Number(deadline) * 1000,
        txHash: r?.txHash,
        creatorRole: r?.creatorRole ?? parsedMetadata?.creatorRole ?? creatorRole,
        dealName: r?.dealName ?? parsedMetadata?.dealName,
        dealDesc: r?.dealDesc ?? parsedMetadata?.dealDesc,
        selectedTerms: r?.selectedTerms ?? parsedMetadata?.selectedTerms,
        deadlineStr: r?.deadlineStr ?? parsedMetadata?.deadline,
        displayName: r?.displayName ?? parsedMetadata?.displayName,
        dashboardData: r?.dashboardData ?? parsedMetadata?.dashboardData,
        result: isResultPublished ? {
          matched: onChainMatched,
          agreedPrice: Number(onChainPrice) > 0 ? Number(onChainPrice) : undefined,
          timestamp: Date.now(),
          txHash: r?.result?.txHash ?? r?.txHash ?? "",
        } : r?.result,
      };

      // Only update if something actually changed
      const hasNewPartyB = partyB !== zeroAddr && !r?.partyB;
      const hasNoCreatorRole = !r?.creatorRole;
      const hasNoDealName = parsedMetadata?.dealName && !r?.dealName;
      if (hasNewPartyB || !r?.partyA || hasNoCreatorRole || hasNoDealName) {
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
    if (room?.myPriceUnit) {
      setPriceUnit(room.myPriceUnit);
    } else if (meta?.unit) {
      setPriceUnit(meta.unit as PriceUnit);
    }
  }, [room?.myPriceUnit, meta?.unit]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed]);

  function rebuildFeed(r: Room) {
    const events: FeedEventType[] = [];
    if (r.partyA) {
      events.push({ kind: "initiator_submitted", ciphertextPreview: r.txHash ? `tx: ${r.txHash.slice(0, 16)}…` : "encrypted on-chain", ts: r.partyA.timestamp });
    }
    if (r.status === "pending_b" && !r.partyB) {
      const viewerIsCounterparty = walletAddr && r.partyA?.address?.toLowerCase() !== walletAddr.toLowerCase();
      events.push({ kind: "waiting_counterparty", isViewerCounterparty: !!viewerIsCounterparty, ts: Date.now() });
    }
    if (r.partyB) {
      events.push({ kind: "counterparty_submitted", ciphertextPreview: "encrypted price submitted on-chain", ts: r.partyB.timestamp });
    }
    if (r.result) {
      const meta = NEGOTIATION_TYPES[r.type];
      if (r.result.matched) {
        const priceDisplay = r.result.agreedPrice ? `$${r.result.agreedPrice}${meta.unit}` : "Prices compared on-chain";
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

  const parsedPrice = parseFloat(price);
  const isValid = !isNaN(parsedPrice) && parsedPrice > 0;

  const getPlaceholder = () => {
    if (!meta) return "";
    const base = meta.placeholder.replace("e.g. ", "").replace(/,/g, "");
    const baseNum = parseFloat(base);
    if (isNaN(baseNum)) return meta.placeholder;

    // Convert from meta.unit to USD first
    let usdValue = baseNum;
    if (meta.unit === "M") usdValue = baseNum * 1000000;
    else if (meta.unit === "K") usdValue = baseNum * 1000;
    else if (meta.unit === "B") usdValue = baseNum * 1000000000;

    // Then convert from USD to priceUnit
    let displayVal = usdValue;
    if (priceUnit === "M") displayVal = usdValue / 1000000;
    else if (priceUnit === "K") displayVal = usdValue / 1000;
    else if (priceUnit === "B") displayVal = usdValue / 1000000000;

    return `e.g. ${displayVal.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  };

  const handleSubmit = async () => {
    if (!room || !meta || !isValid || !walletConnected || isPartyA || !publicClient || !walletClient) return;
    setSubmitStatus("encrypting");
    setEncryptStep("Initializing FHE");
    setEncryptError("");

    const normalizedPrice = normalizeToDefaultUnit(parsedPrice, priceUnit, meta.unit);

    const MAX_ATTEMPTS = 3;
    const TIMEOUT_MS = 180000; // 180s per attempt (accommodates cold WASM/key download on new profiles)

    const stepLabels: Record<string, string> = {
      InitTfhe: "Loading TFHE engine",
      FetchKeys: "Fetching FHE keys from network",
      Pack: "Packing encrypted input",
      Prove: "Generating ZK proof",
      Verify: "Verifying with CoFHE network",
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        setEncryptStep(attempt > 1 ? `Retry ${attempt}/${MAX_ATTEMPTS}. Initializing FHE` : "Initializing FHE");

        // 1. Initialize FHE
        await initFHE(publicClient, walletClient);
        setEncryptStep(attempt > 1 ? `Retry ${attempt}/${MAX_ATTEMPTS}. Encrypting price` : "Encrypting price");

        // 2. Encrypt with timeout
        const encrypted = await Promise.race([
          encryptPrice(BigInt(Math.round(normalizedPrice)), (progress) => {
            if (progress.isStart) {
              const label = stepLabels[progress.step] || progress.step;
              setEncryptStep(attempt > 1 ? `Retry ${attempt}/${MAX_ATTEMPTS}. ${label}` : label);
            }
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Attempt ${attempt}: timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
          ),
        ]);

        setSubmitStatus("computing");

        // 3. Send on-chain joinAndCompute transaction
        const hash = await walletClient.writeContract({
          address: BLIND_NEGOTIATION_ADDRESS,
          abi: BLIND_NEGOTIATION_ABI,
          functionName: "joinAndCompute",
          args: [room.roomIdHex as `0x${string}`, (encrypted as any).encryptedInput],
          chain: walletClient.chain,
          account: walletClient.account,
        });

        // 4. Wait for transaction to be mined
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("[RoomPage] joinAndCompute mined, status:", receipt.status);

        // 5. Add counterparty submitted event
        setFeed(prev => [...prev.filter(e => e.kind !== "waiting_counterparty"), {
          kind: "counterparty_submitted",
          ciphertextPreview: `tx: ${hash.slice(0, 20)}…`,
          ts: Date.now(),
        }]);

        // 6. Update room state
        const updatedRoom: Room = {
          ...room,
          partyB: { address: walletAddr!, timestamp: Date.now() },
          myPrice: Number(parsedPrice),
          myPriceUnit: priceUnit,
          status: "settled",
          result: { matched: false, isEncrypted: true, timestamp: Date.now(), txHash: hash } as any,
        };
        saveRoom(updatedRoom);
        setRoom(updatedRoom);

        // 7. Show brief success, then navigate to result page
        setFeed(prev => [...prev, {
          kind: "result_matched",
          agreedPrice: "FHE comparison complete. Loading results…",
          ts: Date.now(),
        }]);

        setSubmitStatus("done");

        // Auto-navigate to result page after 2s
        setTimeout(() => navigate(`/result/${id}`), 2000);
        return; // Success — exit loop
      } catch (err: any) {
        console.warn(`[RoomPage] Attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err?.message);
        if (attempt < MAX_ATTEMPTS) {
          setEncryptStep(`Attempt ${attempt} failed. Retrying in 3s…`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        // All attempts failed — show error and let user retry
        console.error("[RoomPage] All FHE attempts failed:", err?.message);
        const msg = err?.shortMessage ?? err?.message ?? "Encryption failed";
        const isModuleErr = msg.includes("dynamically imported module") || msg.includes("Failed to fetch") || msg.includes("preload") || msg.includes("MIME type");
        setEncryptError(
          isModuleErr
            ? "A new version of Concord was deployed or encryption modules failed to load. Please reload the page to get the latest update."
            : msg.includes("timed out")
            ? "FHE encryption timed out. The CoFHE network may be congested. Please try again."
            : msg.includes("User rejected") || msg.includes("user rejected")
            ? "Transaction was rejected in your wallet."
            : `Encryption failed: ${msg.length > 100 ? msg.slice(0, 100) + "…" : msg}`
        );
        setSubmitStatus("error");
        return;
      }
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
        <div className="py-4 border-b" style={{ borderColor: "var(--divider)" }}>
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
              {metadataToShow && (
                <button
                  onClick={() => setShowDealDetails(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(10,132,255,0.12)",
                    border: "1px solid rgba(10,132,255,0.25)",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#5ac8fa",
                    marginTop: 8,
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  className="hover:bg-[rgba(10,132,255,0.18)]"
                >
                  <FileText className="w-3.5 h-3.5" />
                  View Deal Details
                </button>
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



        </div>

        {/* Chat feed */}
        <div className="flex-1 overflow-y-auto py-6 space-y-3 min-h-0" style={{ maxHeight: "calc(100vh - 340px)" }}>
          <AnimatePresence initial={false}>
            {feed.map((event, i) => (
              <FeedBubble key={`${event.kind}-${i}`} event={event} index={i} creatorRole={room.creatorRole} />
            ))}
          </AnimatePresence>
          <div ref={feedEndRef} />
        </div>

        {/* Bottom input panel */}
        <div className="border-t py-4" style={{ borderColor: "var(--divider)" }}>
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
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl" style={{ background: "var(--subtle-bg)", border: "1px solid var(--card-border-color)" }}>
                  <Users className="w-4 h-4 text-foreground/20 shrink-0" />
                  <div>
                    <p className="text-[13px] text-foreground/45">Share your room code with the counterparty</p>
                    <p className="text-[11px] text-foreground/22 mt-0.5">They enter it at /join or check their On-Chain Inbox if you sent them an invite</p>
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
              <div className="text-[12px] text-foreground/35 text-center">
                Enter your {room.creatorRole === "buyer" ? "minimum" : "maximum"} price. It will be FHE-encrypted and submitted on-chain.
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/35 text-[15px]">$</span>
                  <input
                    type="number"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder={getPlaceholder()}
                    className="apple-input w-full py-3.5 pl-8 pr-3 text-[15px]"
                    onKeyDown={e => e.key === "Enter" && isValid && handleSubmit()}
                  />
                </div>
                <select
                  value={priceUnit}
                  onChange={e => setPriceUnit(e.target.value as PriceUnit)}
                  className="apple-input px-2.5 py-3.5 text-[13px] text-foreground bg-[rgba(255,255,255,0.03)] border border-white/10 rounded-xl outline-none font-semibold w-[80px] text-center cursor-pointer shrink-0 transition-all hover:bg-white/5 focus:border-white/20"
                >
                  <option value="M" className="bg-[#1c1c1e] text-foreground">M</option>
                  <option value="K" className="bg-[#1c1c1e] text-foreground">K</option>
                  <option value="B" className="bg-[#1c1c1e] text-foreground">B</option>
                  <option value="USD" className="bg-[#1c1c1e] text-foreground">USD</option>
                </select>
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
            <div className="flex flex-col items-center justify-center gap-2 py-4">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 border-2 border-[#0a84ff]/30 border-t-[#0a84ff] rounded-full animate-spin" />
                <span className="text-[13px] text-foreground/50">
                  {submitStatus === "encrypting" ? "Encrypting your price…" : "Submitting to the network…"}
                </span>
              </div>
              {submitStatus === "encrypting" && encryptStep && (
                <span className="text-[11px] text-foreground/30 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3" />
                  {encryptStep}
                </span>
              )}
              {submitStatus === "encrypting" && (
                <span className="text-[10px] text-foreground/20 mt-1">First encryption may take 30-60 seconds</span>
              )}
            </div>
          )}

          {submitStatus === "error" && (
            <div className="flex flex-col items-center gap-2.5 py-4">
              <div className="text-[13px] text-[#ff453a]/80 text-center max-w-sm">{encryptError}</div>
              {encryptError.includes("Reload") || encryptError.includes("dynamic") || encryptError.includes("module") ? (
                <button
                  onClick={() => window.location.reload()}
                  className="btn-apple px-5 py-2.5 text-[13px] flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reload Page
                </button>
              ) : (
                <button
                  onClick={() => { setSubmitStatus("idle"); setEncryptError(""); }}
                  className="btn-apple px-5 py-2.5 text-[13px] flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DEAL DETAILS MODAL */}
      <AnimatePresence>
        {showDealDetails && metadataToShow && (
          <>
            {/* Backdrop */}
            <motion.div
              key="deal-details-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDealDetails(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100,
                background: "rgba(0, 0, 0, 0.6)",
                backdropFilter: "blur(12px)",
              }}
            />

            {/* Centering Wrapper */}
            <div style={{
              position: "fixed",
              inset: 0,
              zIndex: 101,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              padding: 20,
            }}>
              {/* Modal Container */}
              <motion.div
                key="deal-details-modal"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 360, damping: 28 }}
                style={{
                  width: "100%",
                  maxWidth: 500,
                  maxHeight: "85vh",
                  overflowY: "auto",
                  background: "rgba(28, 28, 30, 0.8)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 24,
                  padding: "24px 24px 28px",
                  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
                  pointerEvents: "auto",
                  color: "hsl(var(--foreground))",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(10,132,255,0.12)", border: "1px solid rgba(10,132,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FileText style={{ width: 16, height: 16, color: "#0a84ff" }} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Deal Details</h2>
                      <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: 0 }}>On-chain negotiation context</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDealDetails(false)}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "none",
                      borderRadius: "50%",
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: "hsl(var(--muted-foreground))",
                      transition: "all 0.2s",
                    }}
                    className="hover:bg-white/10 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 16 }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Negotiation Type Badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Negotiation Type</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "rgba(10,132,255,0.12)", border: "1px solid rgba(10,132,255,0.25)", color: "#0a84ff" }}>
                      {metadataToShow.label || metadataToShow.type}
                    </span>
                  </div>

                  {/* Deal Title */}
                  {metadataToShow.dealName && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em" }}>Deal Title / Role</span>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{metadataToShow.dealName}</div>
                    </div>
                  )}

                  {/* Description */}
                  {metadataToShow.dealDesc && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</span>
                      <div style={{ fontSize: 12, color: "hsl(var(--foreground))", opacity: 0.8, lineHeight: 1.5, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        {metadataToShow.dealDesc}
                      </div>
                    </div>
                  )}

                  {/* Deal Terms tags */}
                  {metadataToShow.selectedTerms && metadataToShow.selectedTerms.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em" }}>Agreed Terms &amp; Conditions</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {metadataToShow.selectedTerms.map((t: string) => (
                          <span key={t} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(10,132,255,0.08)", border: "1px solid rgba(10,132,255,0.15)", color: "#5ac8fa" }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dashboard Fields Grid */}
                  {metadataToShow.dashboardFields && metadataToShow.dashboardFields.length > 0 && metadataToShow.dashboardData && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em" }}>Deal Specifications</span>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        {metadataToShow.dashboardFields.map((field: any) => {
                          const val = metadataToShow.dashboardData[field.key];
                          if (!val) return null;
                          let displayVal = val;
                          if (field.type === "currency") {
                            const unit = metadataToShow.dashboardData[field.key + "_unit"] || (field.units ? field.units[0] : "USD");
                            displayVal = `$${parseFloat(val).toLocaleString()} ${unit}`;
                          }
                          return (
                            <div key={field.key}>
                              <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>{field.label}</div>
                              <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{displayVal}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Deadline & Initiated By */}
                  <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>Initiated By</span>
                    <span style={{ fontFamily: "monospace", opacity: 0.8 }}>
                      {metadataToShow.displayName ? `${metadataToShow.displayName} (${room.partyA?.address?.slice(0, 6)}…)` : room.partyA?.address ? `${room.partyA.address.slice(0, 6)}…${room.partyA.address.slice(-4)}` : "Party A"}
                    </span>
                  </div>

                  {metadataToShow.deadline && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>Offer Expires</span>
                      <span>{metadataToShow.deadline} {metadataToShow.timezone || "UTC"}</span>
                    </div>
                  )}

                  {/* Shield / FHE Notice (NO PRICE NOTICE) */}
                  <div style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(48,209,88,0.05)",
                    border: "1px solid rgba(48,209,88,0.15)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                  }}>
                    <ShieldCheck style={{ width: 14, height: 14, color: "#30d158", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "#30d158", lineHeight: 1.4 }}>
                      Party A's price floor remains fully encrypted by FHE and is not visible in this list.
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}



