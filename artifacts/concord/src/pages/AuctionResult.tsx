import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, ArrowRight, Lock, Unlock, RefreshCw, ExternalLink, AlertCircle, ShieldCheck, Gavel, Trophy, Users } from "lucide-react";
import NavBar from "@/components/NavBar";
import { getAuction, saveAuction, NEGOTIATION_TYPES, type Auction } from "@/lib/concord";
import { MULTI_PARTY_AUCTION_ADDRESS, MULTI_PARTY_AUCTION_ABI, auctionConfig, getAuctionExplorerUrl, getExplorerTxUrl } from "@/lib/contracts";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from "wagmi";
import { decryptForTx, initFHE } from "@/lib/fhe";

export default function AuctionResult() {
  const [, params] = useRoute("/auction/result/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const [auction, setAuction] = useState<Auction | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState("");

  // Decrypt & Publish write
  const { writeContract: publishResult, data: publishTxHash, isPending: isPublishing } = useWriteContract();
  const { isLoading: isPublishLoading, isSuccess: isPublishSuccess } = useWaitForTransactionReceipt({ hash: publishTxHash });

  useEffect(() => {
    if (isPublishSuccess) window.location.reload();
  }, [isPublishSuccess]);

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
    if (a) setAuction(a);
  }, [id]);

  // Merge on-chain data
  useEffect(() => {
    if (!onChainInfo || !id.startsWith("0x")) return;
    const [seller, status, createdAt, deadline, negType, maxBidders, currentBids, isResultPublished, onChainMatched, onChainPrice, winner] =
      onChainInfo as [string, number, bigint, bigint, number, number, number, boolean, boolean, bigint, string];

    const local = getAuction(id) || auction;
    const negKey = (["ma", "salary", "realestate", "custom"] as const)[negType] || "custom";
    const zeroAddr = "0x0000000000000000000000000000000000000000";

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
      status: status >= 3 ? "settled" : "bidding",
    };

    if (isResultPublished) {
      updated.result = {
        matched: onChainMatched,
        agreedPrice: onChainMatched && Number(onChainPrice) > 0 ? Number(onChainPrice) : undefined,
        winnerAddress: winner !== zeroAddr ? winner : undefined,
        timestamp: Date.now(),
      };
    } else if (status >= 3) {
      updated.result = local?.result || { matched: false, isEncrypted: true, timestamp: Date.now() };
    }

    saveAuction(updated);
    setAuction(updated);
    setLoading(false);
    setTimeout(() => setRevealed(true), 400);
  }, [onChainInfo, id]);

  // Loading
  if (loading && isOnChainLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <NavBar />
        <RefreshCw className="w-8 h-8 text-[#ff9500] animate-spin" />
        <div className="text-[14px] text-foreground/40">Loading auction result…</div>
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

  const meta = NEGOTIATION_TYPES[auction.type];
  const isEncrypted = (auction.result as any)?.isEncrypted;
  const matched = auction.result?.matched ?? false;
  const agreedPrice = auction.result?.agreedPrice;
  const winnerAddress = auction.result?.winnerAddress;
  const displayPrice = agreedPrice ? `$${agreedPrice}${meta.unit}` : null;
  const isSeller = !!address && auction.seller?.address?.toLowerCase() === address.toLowerCase();
  const isWinner = !!address && !!winnerAddress && winnerAddress.toLowerCase() === address.toLowerCase();
  const isBidder = !!address && auction.bids?.some(b => b.address.toLowerCase() === address.toLowerCase());
  const isParticipant = isSeller || isBidder;

  const handleDecryptAndPublish = async () => {
    if (!isSeller) {
      setDecryptError("Only the auction creator can decrypt and publish the result.");
      return;
    }
    if (!publicClient || !walletClient || !address) {
      setDecryptError("Connect your wallet first.");
      return;
    }
    setDecrypting(true);
    setDecryptError("");
    try {
      await initFHE(publicClient, walletClient);

      const encResult = await publicClient.readContract({
        address: MULTI_PARTY_AUCTION_ADDRESS,
        abi: MULTI_PARTY_AUCTION_ABI,
        functionName: "getEncryptedResult",
        args: [id as `0x${string}`],
        account: address,
      });
      const [ctPrice, ctMatch, ctWinnerIndex] = encResult as [`0x${string}`, `0x${string}`, `0x${string}`];

      const matchResult = await decryptForTx(ctMatch);
      const decryptedMatch = Boolean(matchResult.decryptedValue);
      let decryptedPrice = 0;
      let winnerAddr = "0x0000000000000000000000000000000000000000";

      if (decryptedMatch) {
        const priceResult = await decryptForTx(ctPrice);
        decryptedPrice = Number(priceResult.decryptedValue);

        try {
          const winnerIndexResult = await decryptForTx(ctWinnerIndex);
          const decryptedWinnerIndex = Number(winnerIndexResult.decryptedValue);

          // Fetch winner address by index
          winnerAddr = await publicClient.readContract({
            address: MULTI_PARTY_AUCTION_ADDRESS,
            abi: MULTI_PARTY_AUCTION_ABI,
            functionName: "getBidder",
            args: [id as `0x${string}`, BigInt(decryptedWinnerIndex)],
          }) as `0x${string}`;
        } catch (winnerErr) {
          console.warn("Failed to decrypt winner index or fetch winner address:", winnerErr);
        }
      }

      publishResult({
        address: MULTI_PARTY_AUCTION_ADDRESS,
        abi: MULTI_PARTY_AUCTION_ABI,
        functionName: "publishResult",
        args: [id as `0x${string}`, decryptedMatch, BigInt(decryptedPrice), winnerAddr as `0x${string}`],
      });
    } catch (err: any) {
      console.warn("Decrypt failed:", err);
      setDecryptError(err?.message?.slice(0, 120) || "Decryption failed");
      setDecrypting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-16 px-6 max-w-xl mx-auto">
        <AnimatePresence>
          {revealed && (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>

              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: "rgba(255,149,0,0.1)", border: "1px solid rgba(255,149,0,0.2)" }}>
                  <Gavel className="w-3.5 h-3.5 text-[#ff9500]" />
                  <span className="text-[11px] font-bold text-[#ff9500] uppercase tracking-wider">{meta.label} Auction Result</span>
                </div>
                {auction.dealName && <h1 className="text-[24px] font-bold text-foreground mb-1">{auction.dealName}</h1>}
              </div>

              {/* Encrypted — needs decrypt */}
              {isEncrypted && !matched && !agreedPrice && (
                isSeller ? (
                  <div className="apple-card p-6 text-center mb-6" style={{ borderColor: "rgba(120,80,255,0.3)" }}>
                    <Lock className="w-10 h-10 text-[#a78bfa] mx-auto mb-3" />
                    <h3 className="text-[16px] font-bold text-foreground mb-2">Result Encrypted</h3>
                    <p className="text-[13px] text-foreground/40 mb-4">
                      The FHE tournament is complete. Decrypt and publish the result to reveal the winner.
                    </p>
                    {decryptError && (
                      <div className="text-[12px] text-red-400 mb-3 px-3 py-2 rounded-lg bg-red-400/5">{decryptError}</div>
                    )}
                    <button onClick={handleDecryptAndPublish}
                      disabled={decrypting || isPublishing || isPublishLoading}
                      className="btn-apple px-6 py-3 text-[14px] inline-flex items-center gap-2 disabled:opacity-40">
                      {decrypting || isPublishing || isPublishLoading ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Decrypting…</>
                      ) : (
                        <><Unlock className="w-4 h-4" /> Decrypt & Publish</>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="apple-card p-6 text-center mb-6" style={{ borderColor: "rgba(120,80,255,0.15)" }}>
                    <Lock className="w-10 h-10 text-[#a78bfa]/50 mx-auto mb-3 animate-pulse" />
                    <h3 className="text-[16px] font-bold text-foreground mb-2">FHE Tournament Complete</h3>
                    <p className="text-[13px] text-foreground/40 leading-relaxed max-w-sm mx-auto">
                      The encrypted computations are finished. Waiting for the auction creator (seller) to decrypt and publish the results to reveal the winner.
                    </p>
                  </div>
                )
              )}

              {/* Match found — winner! */}
              {matched && agreedPrice && !isEncrypted && (
                <>
                  {/* Seller View */}
                  {isSeller && (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}
                      className="apple-card p-6 text-center mb-6" style={{ borderColor: "rgba(48,209,88,0.4)", background: "rgba(48,209,88,0.04)" }}>
                      <div className="relative inline-block mb-4">
                        <Trophy className="w-14 h-14 text-[#ffd60a] mx-auto" />
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 }}
                          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#30d158] flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        </motion.div>
                      </div>
                      <h3 className="text-[20px] font-bold text-[#30d158] mb-2">Winner Found!</h3>
                      <div className="text-[11px] text-foreground/30 uppercase tracking-wider mb-1">{meta.resultLabel}</div>
                      <div className="text-[36px] font-black text-foreground mb-3">{displayPrice}</div>
                      {winnerAddress && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(48,209,88,0.08)] border border-[rgba(48,209,88,0.15)]">
                          <Trophy className="w-3 h-3 text-[#ffd60a]" />
                          <span className="text-[11px] text-foreground/50 font-mono">Winner Address: {winnerAddress.slice(0, 8)}…{winnerAddress.slice(-4)}</span>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Winner View */}
                  {isWinner && (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}
                      className="apple-card p-6 text-center mb-6" style={{ borderColor: "rgba(48,209,88,0.4)", background: "rgba(48,209,88,0.04)" }}>
                      <div className="relative inline-block mb-4">
                        <Trophy className="w-14 h-14 text-[#ffd60a] mx-auto" />
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 }}
                          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#30d158] flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        </motion.div>
                      </div>
                      <h3 className="text-[20px] font-bold text-[#30d158] mb-2">Congratulations! You Won!</h3>
                      <div className="text-[11px] text-foreground/30 uppercase tracking-wider mb-1">Final Acquisition Price</div>
                      <div className="text-[36px] font-black text-foreground mb-3">{displayPrice}</div>
                      <div className="text-[13px] text-foreground/50 leading-relaxed max-w-sm mx-auto">
                        Your encrypted bid was the highest eligible bid and met the seller's floor price. You have successfully won the auction!
                      </div>
                    </motion.div>
                  )}

                  {/* Loser View */}
                  {isBidder && !isWinner && (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}
                      className="apple-card p-6 text-center mb-6" style={{ borderColor: "rgba(255,149,0,0.3)", background: "rgba(255,149,0,0.02)" }}>
                      <XCircle className="w-12 h-12 text-[#ff9500] mx-auto mb-3" />
                      <h3 className="text-[18px] font-bold text-[#ff9500] mb-2">Auction Settled</h3>
                      <div className="text-[14px] font-semibold text-foreground/80 mb-2">Bid Not Accepted (Did Not Win)</div>
                      <p className="text-[13px] text-foreground/45 max-w-sm mx-auto leading-relaxed">
                        Another bidder submitted a higher eligible bid, or your bid did not meet the seller's floor price. Thank you for participating.
                      </p>
                    </motion.div>
                  )}

                  {/* General / Other View */}
                  {!isSeller && !isBidder && (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: "easeOut" }}
                      className="apple-card p-6 text-center mb-6" style={{ borderColor: "hsl(var(--border))" }}>
                      <Trophy className="w-12 h-12 text-foreground/30 mx-auto mb-3" />
                      <h3 className="text-[18px] font-bold text-foreground mb-2">Auction Completed</h3>
                      <p className="text-[13px] text-foreground/40 max-w-sm mx-auto">
                        This auction has been settled on-chain.
                      </p>
                    </motion.div>
                  )}
                </>
              )}

              {/* No match */}
              {!matched && !isEncrypted && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="apple-card p-6 text-center mb-6" style={{ borderColor: "rgba(255,69,58,0.3)", background: "rgba(255,69,58,0.03)" }}>
                  <XCircle className="w-12 h-12 text-[#ff453a] mx-auto mb-3" />
                  <h3 className="text-[18px] font-bold text-[#ff453a] mb-2">No Qualifying Bids</h3>
                  <p className="text-[13px] text-foreground/40">
                    None of the encrypted bids met or exceeded the seller's floor price. Neither the floor nor any bid values have been revealed.
                  </p>
                </motion.div>
              )}

              {/* Auction info */}
              <div className="apple-card p-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-foreground/30 uppercase tracking-wider mb-1">Type</div>
                    <div className="text-[13px] font-semibold text-foreground">{meta.label}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-foreground/30 uppercase tracking-wider mb-1">Total Bids</div>
                    <div className="text-[13px] font-semibold text-foreground flex items-center gap-1">
                      <Users className="w-3 h-3 text-foreground/30" /> {auction.bids?.length || 0}/{auction.maxBidders}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-foreground/30 uppercase tracking-wider mb-1">Seller</div>
                    <div className="text-[12px] font-mono text-foreground/50">
                      {auction.seller?.address ? `${auction.seller.address.slice(0, 8)}…${auction.seller.address.slice(-4)}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-foreground/30 uppercase tracking-wider mb-1">Contract</div>
                    <a href={getAuctionExplorerUrl()} target="_blank" rel="noopener noreferrer"
                      className="text-[12px] text-[#0a84ff] flex items-center gap-1 hover:underline">
                      BaseScan <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Industry metadata */}
              {auction.metadata && Object.keys(auction.metadata).length > 0 && (
                <div className="apple-card p-4 mb-4">
                  <div className="text-[10px] text-foreground/30 uppercase tracking-wider mb-3">{meta.label} Details</div>
                  <div className="space-y-2">
                    {meta.dashboardFields.filter(f => auction.metadata?.[f.key]).map(field => (
                      <div key={field.key} className="flex justify-between">
                        <span className="text-[12px] text-foreground/40">{field.label}</span>
                        <span className="text-[12px] text-foreground font-medium">{auction.metadata![field.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={() => navigate("/auction/create")} className="btn-apple flex-1 py-3 text-[14px] flex items-center justify-center gap-2">
                  New Auction
                </button>
                <button onClick={() => navigate("/")} className="flex-1 py-3 text-[14px] text-foreground/40 hover:text-foreground/60 transition-colors text-center">
                  Home
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
