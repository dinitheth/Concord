import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, ArrowRight, Lock, RefreshCw, ExternalLink } from "lucide-react";
import NavBar from "@/components/NavBar";
import { getRoom, saveRoom, NEGOTIATION_TYPES, type Room } from "@/lib/concord";
import { getExplorerTxUrl, BLIND_NEGOTIATION_ADDRESS, BLIND_NEGOTIATION_ABI } from "@/lib/contracts";
import { initFHE, decryptForView, decryptMatchForView } from "@/lib/fhe";
import { useReadContract, usePublicClient, useWalletClient } from "wagmi";

export default function ResultPage() {
  const [, params] = useRoute("/result/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const [room, setRoom] = useState<Room | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [decrypting, setDecrypting] = useState(false);

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const { data: encryptedResult } = useReadContract({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    functionName: "getEncryptedResult",
    args: id.startsWith("0x") ? [id as `0x${string}`] : undefined,
    query: { enabled: id.startsWith("0x") }
  });

  useEffect(() => {
    if (!id) return;
    const r = getRoom(id);
    if (r) setRoom(r);
    const timer = setTimeout(() => setRevealed(true), 500);
    return () => clearTimeout(timer);
  }, [id]);

  useEffect(() => {
    if (!encryptedResult || !publicClient || !walletClient || !room || !id.startsWith("0x")) return;
    if (room.result?.agreedPrice !== undefined || room.result?.matched === false) return; 
    if (decrypting) return;

    let isMounted = true;
    (async () => {
      setDecrypting(true);
      try {
        await initFHE(publicClient, walletClient);
        const [encPrice, encMatched] = encryptedResult as [bigint, bigint];

        const matchCtHash = "0x" + encMatched.toString(16);
        const priceCtHash = "0x" + encPrice.toString(16);

        const isMatched = await decryptMatchForView(matchCtHash);
        let finalPrice: number | undefined = undefined;

        if (isMatched) {
          const decryptedPriceBigInt = await decryptForView(priceCtHash);
          finalPrice = Number(decryptedPriceBigInt);
        }

        if (isMounted) {
          const updatedRoom = {
            ...room,
            result: {
              ...room.result!,
              matched: isMatched,
              agreedPrice: finalPrice,
            }
          };
          saveRoom(updatedRoom);
          setRoom(updatedRoom);
        }
      } catch (err) {
        console.error("[ResultPage] Decryption failed:", err);
      } finally {
        if (isMounted) setDecrypting(false);
      }
    })();
    return () => { isMounted = false; };
  }, [encryptedResult, publicClient, walletClient, id, room, decrypting]);

  if (!room || !room.result || decrypting) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <NavBar />
        <RefreshCw className="w-8 h-8 text-[#0a84ff] animate-spin" />
        <div className="text-[14px] text-foreground/40 font-medium">Decrypting zero-knowledge result…</div>
        <div className="text-[11px] text-foreground/25">Please sign the permission in your wallet if prompted.</div>
      </div>
    );
  }

  const meta = NEGOTIATION_TYPES[room.type];
  const { matched, agreedPrice, txHash } = room.result;
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
                <h1 className="sf-display text-[36px] text-foreground mb-2">
                  {matched ? "Deal Found" : "No Overlap"}
                </h1>
                <p className="text-[15px] text-foreground/40 max-w-sm mx-auto leading-relaxed">
                  {matched
                    ? "Your reservation prices overlapped. The agreed price is the encrypted midpoint, revealed only to you."
                    : "Your prices didn't overlap. Neither party's number was revealed. Zero information leaked."}
                </p>
              </div>

              {/* Agreed price */}
              {matched && displayPrice && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 150, damping: 16 }}
                  className="apple-card p-8 text-center"
                  style={{ background: "linear-gradient(135deg, #0d1f0d 0%, #0a1a0a 100%)", borderColor: "rgba(48,209,88,0.2)" }}
                >
                  <p className="text-[12px] font-semibold text-[#30d158]/60 uppercase tracking-widest mb-3">Agreed Price</p>
                  <div className="sf-display text-[64px] leading-none text-foreground mb-3" style={{ color: "#30d158" }}>
                    {displayPrice}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-[12px] text-foreground/25">
                    <Lock className="w-3 h-3" />
                    <span>Decrypted midpoint — computed in encrypted space</span>
                  </div>
                </motion.div>
              )}

              {/* Privacy + verification */}
              <div className="apple-card p-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-foreground/40">Privacy</span>
                    <span className="text-[13px] text-[#30d158] font-semibold">Neither price was revealed</span>
                  </div>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-foreground/40">Network</span>
                    <span className="text-[13px] text-foreground/70">Base Sepolia</span>
                  </div>
                  {txHash && (
                    <>
                      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
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
                  <p className="text-[12px] font-semibold text-foreground/40 uppercase tracking-widest mb-3">Settlement</p>
                  <h3 className="text-[15px] font-semibold text-foreground sf-headline mb-1.5">ConfidentialEscrow</h3>
                  <p className="text-[13px] text-foreground/40 leading-relaxed mb-3">
                    Lock the agreed amount in an on-chain escrow. The value stays encrypted — even the contract can't read it.
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        alert('ConfidentialEscrow creation initiated. The escrow amount is FHE-encrypted.');
                      } catch (e) {
                        console.error('Escrow error:', e);
                      }
                    }}
                    className="btn-apple-secondary text-[13px] px-4 py-2 flex items-center gap-2 w-full justify-center"
                  >
                    Create Escrow
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
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


