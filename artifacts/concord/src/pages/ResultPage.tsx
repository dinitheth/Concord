import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, ArrowRight, Lock, Unlock, RefreshCw, ExternalLink, AlertCircle, ShieldCheck } from "lucide-react";
import NavBar from "@/components/NavBar";
import { getRoom, saveRoom, NEGOTIATION_TYPES, type Room } from "@/lib/concord";
import {
  getExplorerTxUrl, BLIND_NEGOTIATION_ADDRESS, BLIND_NEGOTIATION_ABI,
} from "@/lib/contracts";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from "wagmi";
import { decryptBoolForView, decryptUint64ForView, initFHE } from "@/lib/fhe";

export default function ResultPage() {
  const [, params] = useRoute("/result/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const [room, setRoom] = useState<Room | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);



  // ── Decrypt & Publish write ─────────────────────────────────
  const { writeContract: publishResult, data: publishTxHash, isPending: isPublishing } = useWriteContract();
  const { isLoading: isPublishLoading, isSuccess: isPublishSuccess } = useWaitForTransactionReceipt({ hash: publishTxHash });

  useEffect(() => {
    if (isPublishSuccess) {
      // It published! Reload page to see the new state
      window.location.reload();
    }
  }, [isPublishSuccess]);

  useEffect(() => {
    setAccessDenied(false);
    setDecryptError("");
  }, [address, id]);




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
    const creatorRole = negType >= 10 ? "buyer" : "seller";
    const baseNegType = negType % 10;
    const negKey = (["ma", "salary", "realestate", "custom"] as const)[baseNegType] || "custom";
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
      creatorRole: localRoom?.creatorRole ?? creatorRole,
    };

    // Determine result
    if (isResultPublished) {
      // Published on-chain — use those values
      updatedRoom.result = {
        matched: onChainMatched,
        agreedPrice: onChainMatched && Number(onChainPrice) > 0 ? Number(onChainPrice) : undefined,
        timestamp: Date.now(),
        txHash: localRoom?.result?.txHash ?? localRoom?.txHash,
      };
    } else if (status >= 3) {
      // Settled (FHE comparison ran) but not published
      updatedRoom.result = localRoom?.result || {
        matched: false, // We don't know until we decrypt!
        isEncrypted: true, // Flag to show we need to decrypt
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
  const isEncrypted = (room.result as any)?.isEncrypted;
  const isViewerParty = !!address && (
    room.partyA?.address?.toLowerCase() === address.toLowerCase() ||
    room.partyB?.address?.toLowerCase() === address.toLowerCase()
  );
  const isDealNotFoundForViewer = !!isEncrypted && !!address && (!isViewerParty || accessDenied);
  const matched = room.result?.matched ?? false;
  const agreedPrice = room.result?.agreedPrice;
  const txHash = room.result?.txHash || room.txHash;
  const displayPrice = agreedPrice ? `$${agreedPrice}${meta.unit}` : null;


  const handleDecryptAndPublish = async () => {
    if (!publicClient || !walletClient) {
      setDecryptError("Connect your wallet before decrypting the result.");
      return;
    }
    if (!address) {
      setDecryptError("Connect Party A or Party B's wallet before decrypting the result.");
      return;
    }
    if (!isViewerParty) {
      setAccessDenied(true);
      setDecryptError("Deal not found for this wallet. Only Party A or Party B can decrypt and publish this result.");
      return;
    }
    setDecrypting(true);
    setDecryptError("");
    setAccessDenied(false);
    try {
      await initFHE(publicClient, walletClient);

      // 1. Fetch the encrypted handles from the contract
      const encResult = await publicClient.readContract({
        address: BLIND_NEGOTIATION_ADDRESS,
        abi: BLIND_NEGOTIATION_ABI,
        functionName: "getEncryptedResult",
        args: [id as `0x${string}`],
        account: address,
      });
      const [ctPrice, ctMatch] = encResult as [`0x${string}`, `0x${string}`];

      // 2. Actually decrypt them using the local view client (via Fhenix CoFHE)
      const matchResult = await decryptBoolForView(ctMatch);
      const decryptedMatch = matchResult;
      let decryptedPrice = 0;

      if (decryptedMatch) {
        const priceResult = await decryptUint64ForView(ctPrice);
        decryptedPrice = Number(priceResult);
      }

      // 3. Publish the decrypted plaintext result to the contract!
      publishResult({
        address: BLIND_NEGOTIATION_ADDRESS,
        abi: BLIND_NEGOTIATION_ABI,
        functionName: "publishResult",
        args: [id as `0x${string}`, decryptedMatch, BigInt(decryptedPrice)],
      });
    } catch (err) {
      console.warn("Decrypt & Publish failed:", err instanceof Error ? err.message : err);
      const msg = err instanceof Error ? err.message : "Unable to decrypt and publish the result.";
      if (msg.toLowerCase().includes("not a party")) {
        setAccessDenied(true);
        setDecryptError("Deal not found for this wallet. Switch to Party A or Party B to decrypt the result.");
      } else {
        setDecryptError(msg.length > 120 ? `${msg.slice(0, 120)}...` : msg);
      }
      setDecrypting(false);
    }
  };

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
                  style={matched && !isDealNotFoundForViewer
                    ? { background: "rgba(48,209,88,0.1)", border: "1px solid rgba(48,209,88,0.3)" }
                    : { background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.2)" }
                  }
                >
                  {isDealNotFoundForViewer ? (
                    <XCircle className="w-10 h-10 text-[#ff453a]" strokeWidth={1.75} />
                  ) : isEncrypted ? (
                    <Lock className="w-10 h-10 text-[#a78bfa]" strokeWidth={1.75} />
                  ) : matched ? (
                    <CheckCircle2 className="w-10 h-10 text-[#30d158]" strokeWidth={1.75} />
                  ) : (
                    <XCircle className="w-10 h-10 text-[#ff453a]" strokeWidth={1.75} />
                  )}
                </motion.div>
                <h1 className="sf-display text-[28px] sm:text-[36px] text-foreground mb-2">
                  {isDealNotFoundForViewer ? "Deal Not Found" : isEncrypted ? "Result Encrypted" : matched ? "Prices Compared" : "No Overlap"}
                </h1>
                <p className="text-[15px] text-foreground/40 max-w-sm mx-auto leading-relaxed">
                  {isDealNotFoundForViewer
                    ? "This connected wallet is not a party to the negotiation, so it cannot decrypt or publish the encrypted result."
                    : isEncrypted
                    ? "The comparison finished, but the result is locked inside an FHE ciphertext."
                    : matched
                    ? "Both prices were submitted and compared using fully homomorphic encryption. The computation ran entirely in encrypted space. Neither party's number was ever revealed."
                    : "Your prices didn't overlap. Neither party's number was revealed. Zero information leaked."}
                </p>
              </div>

              {/* Agreed price — show if published, otherwise show encrypted status */}
              {isDealNotFoundForViewer ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="apple-card p-8 text-center"
                  style={{ background: "rgba(255,69,58,0.06)", borderColor: "rgba(255,69,58,0.2)" }}
                >
                  <p className="text-[12px] font-semibold text-[#ff453a] uppercase tracking-widest mb-3">Not a Room Party</p>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <XCircle className="w-8 h-8 text-[#ff453a]" strokeWidth={1.5} />
                  </div>
                  <p className="text-[14px] text-foreground/50 mb-4">
                    No decryptable deal was found for this wallet. Switch to Party A or Party B, or wait for a party to publish the result.
                  </p>
                  <button
                    onClick={() => navigate("/inbox")}
                    className="btn-ghost w-full py-3 text-[14px] flex items-center justify-center gap-2"
                  >
                    Check Inbox
                  </button>
                </motion.div>
              ) : isEncrypted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="apple-card p-8 text-center"
                  style={{ background: "rgba(120,80,255,0.06)", borderColor: "rgba(120,80,255,0.2)" }}
                >
                  <p className="text-[12px] font-semibold text-[#a78bfa] uppercase tracking-widest mb-3">FHE Comparison Complete</p>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Lock className="w-8 h-8 text-[#a78bfa]" strokeWidth={1.5} />
                  </div>
                  <p className="text-[14px] text-foreground/50 mb-4">
                    The result is completely encrypted on Base Sepolia. You must decrypt it to see if you matched!
                  </p>
                  <button
                    onClick={handleDecryptAndPublish}
                    disabled={isPublishing || isPublishLoading || decrypting}
                    className="btn-apple w-full py-3 text-[14px] flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #7850ff, #a78bfa)" }}
                  >
                    {isPublishing || isPublishLoading || decrypting ? (
                       <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {decrypting && !isPublishing ? "Decrypting via Fhenix..." : "Publishing Result…"}</>
                    ) : (
                       <><Unlock className="w-4 h-4" /> Decrypt & Publish Result</>
                    )}
                  </button>
                  {decryptError && (
                    <p className="mt-3 text-[12px] text-[#ff453a] leading-relaxed">{decryptError}</p>
                  )}
                </motion.div>
              ) : matched ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 150, damping: 16 }}
                  className="apple-card p-8 text-center"
                  style={{ background: "var(--green-subtle-bg)", borderColor: "var(--green-subtle-border)" }}
                >
                  {displayPrice && (
                    <>
                      <p className="text-[12px] font-semibold text-[#30d158]/60 uppercase tracking-widest mb-3">{meta.resultLabel || "Agreed Price"}</p>
                      <div className="sf-display text-[40px] sm:text-[52px] md:text-[64px] leading-none text-foreground mb-3" style={{ color: "#30d158" }}>
                        {displayPrice}
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-[12px] text-foreground/25">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Decrypted midpoint, verified on-chain</span>
                      </div>
                    </>
                  )}
                </motion.div>
              ) : null}


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
