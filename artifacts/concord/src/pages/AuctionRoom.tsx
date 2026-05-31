import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Zap, CheckCircle2, ArrowRight, Wallet, ShieldCheck, Users, AlertCircle, RefreshCw, Gavel, Clock, Send } from "lucide-react";
import { useAccount, usePublicClient, useWalletClient, useReadContract } from "wagmi";
import { useModal } from "connectkit";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";
import { getAuction, saveAuction, updateAuction, NEGOTIATION_TYPES, formatPrice, type Auction } from "@/lib/concord";
import { encryptPrice, initFHE } from "@/lib/fhe";
import { MULTI_PARTY_AUCTION_ABI, MULTI_PARTY_AUCTION_ADDRESS, auctionConfig, mapAuctionStatus, roomIdToCode, decodeAuctionId } from "@/lib/contracts";

function timeLeft(deadline: number): string {
  const diff = deadline - Date.now();
  if (diff <= 0) return "Bidding closed";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m ${s}s left`;
}

export default function AuctionRoom() {
  const [, params] = useRoute("/auction/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const { address } = useAccount();
  const { setOpen: openWalletModal } = useModal();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [bidPrice, setBidPrice] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "encrypting" | "computing" | "done" | "error">("idle");
  const [encryptStep, setEncryptStep] = useState("");
  const [encryptError, setEncryptError] = useState("");
  const [computeStatus, setComputeStatus] = useState<"idle" | "computing" | "done">("idle");
  const [timeDisplay, setTimeDisplay] = useState("");

  // Read on-chain auction info
  const { data: onChainInfo, isLoading: isOnChainLoading } = useReadContract({
    ...auctionConfig,
    functionName: "getAuctionInfo",
    args: id.startsWith("0x") ? [id as `0x${string}`] : undefined,
    query: { enabled: id.startsWith("0x"), refetchInterval: 5000 },
  });

  // Load local data
  useEffect(() => {
    if (!id) return;
    const a = getAuction(id);
    if (a) {
      setAuction(a);
    } else {
      // Decode floor price and unit from ID for fallback state
      const decoded = decodeAuctionId(id);
      if (decoded) {
        setAuction({
          id,
          auctionIdHex: id,
          type: "custom",
          label: "Auction",
          status: "bidding",
          sellerPrice: decoded.price,
          sellerPriceUnit: decoded.unit,
          maxBidders: 5,
          bids: [],
          seller: { address: "", timestamp: Date.now() },
          createdAt: Date.now(),
          deadline: Date.now() + 86400000,
        });
      }
    }
  }, [id]);

  // Merge on-chain data
  useEffect(() => {
    if (!onChainInfo || !id.startsWith("0x")) return;
    const [seller, status, createdAt, deadline, negType, maxBidders, currentBids, isResultPublished, matched, agreedPrice, winner] =
      onChainInfo as [string, number, bigint, bigint, number, number, number, boolean, boolean, bigint, string];

    const local = getAuction(id);
    const negKey = (["ma", "salary", "realestate", "custom"] as const)[negType] || "custom";

    const decoded = decodeAuctionId(id);
    const sellerPrice = local?.sellerPrice ?? decoded?.price;
    const sellerPriceUnit = local?.sellerPriceUnit ?? decoded?.unit;

    const updated: Auction = {
      ...(local || {
        id,
        auctionIdHex: id,
        type: negKey,
        label: NEGOTIATION_TYPES[negKey].label,
        createdAt: Number(createdAt) * 1000,
        deadline: Number(deadline) * 1000,
        maxBidders,
        bids: [],
        seller: { address: seller, timestamp: Number(createdAt) * 1000 },
      }),
      status: mapAuctionStatus(status),
      maxBidders,
      sellerPrice,
      sellerPriceUnit,
      bids: (() => {
        const merged = [...(local?.bids || [])];
        if (merged.length > currentBids) {
          return merged.slice(0, currentBids);
        }
        while (merged.length < currentBids) {
          merged.push({ address: "", timestamp: Date.now() });
        }
        return merged;
      })(),
    };

    if (isResultPublished) {
      updated.result = {
        matched,
        agreedPrice: matched && Number(agreedPrice) > 0 ? Number(agreedPrice) : undefined,
        winnerAddress: winner !== "0x0000000000000000000000000000000000000000" ? winner : undefined,
        timestamp: Date.now(),
      };
    } else if (status >= 3) {
      updated.result = local?.result || { matched: false, isEncrypted: true, timestamp: Date.now() };
    }

    saveAuction(updated);
    setAuction(updated);
  }, [onChainInfo, id]);

  // Timer
  useEffect(() => {
    if (!auction?.deadline) return;
    const tick = () => setTimeDisplay(timeLeft(auction.deadline));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [auction?.deadline]);

  const isSeller = !!address && auction?.seller?.address?.toLowerCase() === address.toLowerCase();
  const hasBid = !!address && auction?.bids?.some(b => b.address.toLowerCase() === address.toLowerCase());
  const meta = auction ? NEGOTIATION_TYPES[auction.type] : NEGOTIATION_TYPES["custom"];
  const currentBids = auction?.bids?.length || 0;
  const maxBid = auction?.maxBidders || 5;
  const isBiddingOpen = auction?.status === "bidding";
  const isDeadlinePassed = auction ? Date.now() > auction.deadline : false;
  const canCompute = isSeller && (isDeadlinePassed || currentBids >= maxBid) && isBiddingOpen;
  const isSettled = auction?.status === "settled";

  // Handle bid submission
  const handleSubmitBid = async () => {
    if (!bidPrice || !publicClient || !walletClient || !auction) return;
    const parsed = parseFloat(bidPrice);
    if (isNaN(parsed) || parsed <= 0) return;
    if (auction.sellerPrice && parsed < auction.sellerPrice) {
      alert(`Your bid must be at least ${formatPrice(auction.sellerPrice, auction.sellerPriceUnit || "")}.`);
      return;
    }

    setSubmitStatus("encrypting");
    setEncryptError("");
    const stepLabels: Record<string, string> = {
      InitTfhe: "Loading TFHE engine", FetchKeys: "Fetching FHE keys",
      Pack: "Packing encrypted input", Prove: "Generating ZK proof", Verify: "Verifying with CoFHE",
    };

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        setEncryptStep(attempt > 1 ? `Retry ${attempt}/${MAX_ATTEMPTS}. Initializing FHE` : "Initializing FHE");
        await initFHE(publicClient, walletClient);

        const encrypted = await Promise.race([
          encryptPrice(BigInt(Math.round(parsed)), (p) => {
            if (p.isStart) setEncryptStep(attempt > 1 ? `Retry ${attempt}. ${stepLabels[p.step] || p.step}` : stepLabels[p.step] || p.step);
          }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timed out")), 180000)),
        ]);

        setSubmitStatus("computing");
        setEncryptStep("Submitting bid…");

        const hash = await walletClient.writeContract({
          address: MULTI_PARTY_AUCTION_ADDRESS,
          abi: MULTI_PARTY_AUCTION_ABI,
          functionName: "submitBid",
          args: [auction.auctionIdHex as `0x${string}`, (encrypted as any).encryptedInput],
          chain: walletClient.chain,
          account: walletClient.account,
        });

        await publicClient.waitForTransactionReceipt({ hash });
        updateAuction(id, {
          bids: [...(auction.bids || []), { address: address!, timestamp: Date.now() }],
        });
        setSubmitStatus("done");
        return;
      } catch (err: any) {
        if (attempt >= MAX_ATTEMPTS) {
          console.error("[AuctionRoom] All FHE attempts failed:", err?.message);
          const msg = err?.shortMessage ?? err?.message ?? "Encryption failed";
          const isModuleErr = msg.includes("dynamically imported module") || msg.includes("Failed to fetch") || msg.includes("preload") || msg.includes("MIME type");
          setEncryptError(
            isModuleErr
              ? "A new version of Concord was deployed or encryption modules failed to load. Please reload the page to get the latest update."
              : msg.includes("timed out")
              ? "FHE encryption timed out. The CoFHE network may be congested. Please try again."
              : msg.includes("User rejected") || msg.includes("user rejected")
              ? "Transaction was rejected in your wallet."
              : msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("rate-limit") || msg.toLowerCase().includes("rate limited")
              ? "Your wallet is connected to a rate-limited RPC (base-sepolia.drpc.org). Please open MetaMask network settings and change your RPC URL to: https://sepolia.base.org"
              : `Encryption failed: ${msg.length > 100 ? msg.slice(0, 100) + "…" : msg}`
          );
          setSubmitStatus("error");
        } else {
          setEncryptStep(`Attempt ${attempt} failed. Retrying…`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }
  };

  // Handle compute
  const handleCompute = async () => {
    if (!walletClient || !publicClient || !auction) return;
    setComputeStatus("computing");
    try {
      const hash = await walletClient.writeContract({
        address: MULTI_PARTY_AUCTION_ADDRESS,
        abi: MULTI_PARTY_AUCTION_ABI,
        functionName: "computeAuction",
        args: [auction.auctionIdHex as `0x${string}`],
        chain: walletClient.chain,
        account: walletClient.account,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setComputeStatus("done");
      setTimeout(() => navigate(`/auction/result/${id}`), 2000);
    } catch (err: any) {
      console.error("Compute failed:", err);
      setComputeStatus("idle");
    }
  };

  // Loading
  if (!auction && isOnChainLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <NavBar />
        <RefreshCw className="w-8 h-8 text-[#ff9500] animate-spin" />
        <div className="text-[14px] text-foreground/40">Loading auction…</div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <NavBar />
        <AlertCircle className="w-10 h-10 text-foreground/20" />
        <div className="text-[14px] text-foreground/40">Auction not found</div>
        <button onClick={() => navigate("/auction/create")} className="btn-apple px-6 py-2.5 text-[14px]">Create Auction</button>
      </div>
    );
  }

  // Navigate to result if settled
  if (isSettled) {
    const isResultPublished = auction.result && !(auction.result as any).isEncrypted;
    
    if (isSeller || isResultPublished) {
      return (
        <div className="min-h-screen bg-background">
          <NavBar />
          <div className="pt-20 pb-16 px-6 max-w-xl mx-auto text-center">
            <CheckCircle2 className="w-12 h-12 text-[#30d158] mx-auto mb-4" />
            <h2 className="text-[20px] font-bold text-foreground mb-2">FHE Computation Complete</h2>
            <p className="text-[13px] text-foreground/40 mb-6">
              {isResultPublished ? "The auction results are published. View the details." : "The encrypted tournament has finished. View results to decrypt and publish."}
            </p>
            <button onClick={() => navigate(`/auction/result/${id}`)} className="btn-apple px-8 py-3 text-[14px] inline-flex items-center gap-2">
              View Results <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    } else {
      return (
        <div className="min-h-screen bg-background">
          <NavBar />
          <div className="pt-20 pb-16 px-6 max-w-xl mx-auto text-center">
            <Lock className="w-12 h-12 text-[#a78bfa]/50 mx-auto mb-4 animate-pulse" />
            <h2 className="text-[20px] font-bold text-foreground mb-2">FHE Computation Complete</h2>
            <p className="text-[13px] text-foreground/40 leading-relaxed max-w-sm mx-auto mb-6">
              The encrypted computations are finished. Waiting for the auction owner (seller) to decrypt and publish the results to reveal the winner.
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-16 px-6 max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Gavel className="w-4 h-4 text-[#ff9500]" />
                <span className="text-[10px] font-bold text-[#ff9500] uppercase tracking-wider">{meta.label} Auction</span>
              </div>
              <h1 className="text-[22px] font-bold text-foreground">{auction.dealName || "Sealed-Bid Auction"}</h1>
            </div>
          </div>

          {/* Bid progress - only for seller */}
          {isSeller && (
            <div className="apple-card p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#ff9500]" />
                  <span className="text-[13px] font-semibold text-foreground">Bids Received</span>
                </div>
                <span className="text-[18px] font-bold text-[#ff9500]">{currentBids}<span className="text-foreground/30">/{maxBid}</span></span>
              </div>
              <div className="w-full h-2 rounded-full bg-foreground/5 overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #ff9500, #ff6b00)" }}
                  initial={{ width: 0 }} animate={{ width: `${(currentBids / maxBid) * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Clock className="w-3 h-3 text-foreground/30" />
                <span className="text-[12px] text-foreground/40">{timeDisplay}</span>
              </div>
            </div>
          )}

          {/* Time Remaining - only for bidder */}
          {!isSeller && (
            <div className="apple-card p-4 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#ff9500]" />
                <span className="text-[13px] font-semibold text-foreground">Time Remaining</span>
              </div>
              <span className="text-[13px] font-bold text-[#ff9500]">{timeDisplay}</span>
            </div>
          )}

          {/* Seller's floor */}
          <div className="apple-card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-[#0a84ff]" />
                <span className="text-[13px] font-semibold text-foreground">Seller's Floor Price</span>
              </div>
              {auction.sellerPrice && (
                <span className="text-[14px] font-bold text-[#ff9500]">
                  {formatPrice(auction.sellerPrice, auction.sellerPriceUnit || "")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(10,132,255,0.06)" }}>
              <ShieldCheck className="w-3 h-3 text-[#0a84ff]/50" />
              <span className="text-[11px] text-[#0a84ff]/60">
                {auction.sellerPrice
                  ? `Minimum bid requirement: Bids must be at least ${formatPrice(auction.sellerPrice, auction.sellerPriceUnit || "")}.`
                  : "Encrypted on-chain — invisible to all bidders"}
              </span>
            </div>
          </div>

          {/* Bid bubbles */}
          {currentBids > 0 && (
            <div className="space-y-2 mb-4">
              {Array.from({ length: currentBids }).map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="apple-card p-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold bg-[rgba(90,200,250,0.12)] text-[#5ac8fa] border border-[rgba(90,200,250,0.2)]">
                    B{i + 1}
                  </div>
                  <div className="flex-1">
                    <span className="text-[12px] font-medium text-foreground">Bidder {i + 1}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Lock className="w-2.5 h-2.5 text-foreground/20" />
                      <span className="text-[10px] text-foreground/25">Encrypted ceiling submitted</span>
                    </div>
                  </div>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#30d158]/40" />
                </motion.div>
              ))}
            </div>
          )}

          {/* Submit bid (for non-seller) */}
          {!isSeller && isBiddingOpen && !hasBid && !isDeadlinePassed && (
            <div className="apple-card p-5 mb-4">
              <div style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--foreground))", opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                Your Sealed Bid (Maximum)
              </div>
              <div className="flex gap-2 mb-4">
                <input type="number" value={bidPrice} onChange={e => setBidPrice(e.target.value)}
                  placeholder="Enter your bid"
                  className="flex-1 apple-card px-4 py-3 text-[16px] font-semibold text-foreground bg-transparent outline-none placeholder:text-foreground/20" />
                <div className="apple-card px-3 py-3 text-[13px] text-foreground/50 font-semibold flex items-center">{meta.unit || "USD"}</div>
              </div>

              {auction.sellerPrice && bidPrice && parseFloat(bidPrice) < auction.sellerPrice && (
                <div className="text-[12px] text-[#ff453a] mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(255, 69, 58, 0.08)", border: "1px solid rgba(255, 69, 58, 0.15)" }}>
                  <AlertCircle className="w-4 h-4 text-[#ff453a] shrink-0 mt-0.5" />
                  <span>
                    Bid must be at least <strong>{formatPrice(auction.sellerPrice, auction.sellerPriceUnit || "")}</strong> (not less than {formatPrice(auction.sellerPrice, auction.sellerPriceUnit || "")}).
                  </span>
                </div>
              )}

              {submitStatus === "idle" ? (
                <button onClick={handleSubmitBid} disabled={!bidPrice || parseFloat(bidPrice) <= 0 || (!!auction.sellerPrice && parseFloat(bidPrice) < auction.sellerPrice)}
                  className="btn-apple w-full py-3 text-[14px] flex items-center justify-center gap-2 disabled:opacity-30">
                  <Lock className="w-4 h-4" /> Encrypt & Submit Bid
                </button>
              ) : submitStatus === "done" ? (
                <div className="flex items-center justify-center gap-2 py-3 text-[#30d158]">
                  <CheckCircle2 className="w-5 h-5" /> <span className="text-[14px] font-semibold">Bid Submitted!</span>
                </div>
              ) : submitStatus === "error" ? (
                <div className="flex flex-col items-center gap-2.5 py-3">
                  <div className="text-[13px] text-[#ff453a]/80 text-center max-w-sm">{encryptError}</div>
                  {encryptError.includes("Reload") || encryptError.includes("dynamic") || encryptError.includes("module") ? (
                    <button
                      onClick={() => window.location.reload()}
                      className="btn-apple px-5 py-2.5 text-[13px] flex items-center gap-2 w-full justify-center"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reload Page
                    </button>
                  ) : (
                    <button
                      onClick={() => { setSubmitStatus("idle"); setEncryptError(""); }}
                      className="btn-apple px-5 py-2.5 text-[13px] flex items-center gap-2 w-full justify-center"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-[#ff9500]/30 border-t-[#ff9500] rounded-full animate-spin" />
                    <span className="text-[13px] text-foreground/50">{encryptStep}</span>
                  </div>
                  {submitStatus === "encrypting" && (
                    <p className="text-[11px] text-foreground/30 text-center max-w-sm leading-relaxed mt-1">
                      First-time FHE setup downloads cryptoprove modules (~20MB) and may take up to 2-3 minutes. Please do not close or reload this page.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {hasBid && (
            <div className="apple-card p-4 mb-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-[#30d158] mx-auto mb-2" />
              <div className="text-[14px] font-semibold text-foreground">Your bid is locked in</div>
              <div className="text-[12px] text-foreground/40 mt-1">Waiting for auction computation…</div>
            </div>
          )}

          {/* Compute button */}
          {canCompute && (
            <button onClick={handleCompute} disabled={computeStatus === "computing"}
              className="btn-apple w-full py-3.5 text-[14px] flex items-center justify-center gap-2 mb-4" style={{ background: "linear-gradient(135deg, #ff9500, #ff6b00)" }}>
              {computeStatus === "computing" ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running FHE Tournament…</>
              ) : computeStatus === "done" ? (
                <><CheckCircle2 className="w-4 h-4" /> Complete! Loading results…</>
              ) : (
                <><Zap className="w-4 h-4" /> Compute Auction (FHE Tournament)</>
              )}
            </button>
          )}

          <FHEBadge />
        </motion.div>
      </div>
    </div>
  );
}
