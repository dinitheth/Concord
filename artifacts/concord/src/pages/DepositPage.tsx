import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { Lock, ShieldCheck, ArrowRight, Wallet, CheckCircle2, AlertCircle, ExternalLink, DollarSign, ArrowLeft } from "lucide-react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import NavBar from "@/components/NavBar";
import {
  CONFIDENTIAL_ESCROW_ADDRESS, CONFIDENTIAL_ESCROW_ABI,
  USDC_ADDRESS, USDC_ABI,
  escrowConfig,
  getEscrowExplorerUrl, getExplorerTxUrl,
  EscrowStatus,
} from "@/lib/contracts";
import { getRoom } from "@/lib/concord";

export default function DepositPage() {
  const [, params] = useRoute("/deposit/:id");
  const [, navigate] = useLocation();
  const roomId = (params?.id ?? "") as `0x${string}`;

  const { address } = useAccount();

  const [sellerAddress, setSellerAddress] = useState("");
  const [step, setStep] = useState<"review" | "approving" | "depositing" | "done">("review");
  const [error, setError] = useState("");

  // Load room — pre-fill from saved floor price + unit
  const room = getRoom(roomId);
  const floorPrice = room?.myPrice ?? 0;
  const priceUnit = room?.myPriceUnit ?? "USD";

  const isCreator = room && address && room.partyA?.address?.toLowerCase() === address.toLowerCase();
  const isViewerBuyer = !room || (
    room.creatorRole === "buyer" ? isCreator : !isCreator
  );

  // Convert the raw price + unit to the actual USDC amount (6 decimals)
  function priceToRawUSDC(value: number, unit: string): bigint {
    let usd = value;
    if (unit === "M")   usd = value * 1_000_000;
    if (unit === "K")   usd = value * 1_000;
    if (unit === "B")   usd = value * 1_000_000_000;
    // Multiply by 10^6 for USDC decimals
    return BigInt(Math.round(usd * 1_000_000));
  }

  function formatPriceDisplay(value: number, unit: string): string {
    if (!value) return "—";
    if (unit === "M")   return `$${value.toLocaleString()}M (≈ $${(value * 1_000_000).toLocaleString()})`;
    if (unit === "K")   return `$${value.toLocaleString()}K (≈ $${(value * 1_000).toLocaleString()})`;
    if (unit === "B")   return `$${value.toLocaleString()}B (≈ $${(value * 1_000_000_000).toLocaleString()})`;
    return `$${value.toLocaleString()} USD`;
  }

  // Deposit amount in USDC (6 decimals)
  const amountBigInt = floorPrice > 0 ? priceToRawUSDC(floorPrice, priceUnit) : 0n;

  // Pre-fill seller address from saved room
  useEffect(() => {
    if (!room) return;
    if (room.creatorRole === "buyer") {
      const seller = room.partyB?.address || room.notifyAddr || "";
      setSellerAddress(seller);
    } else {
      if (room.partyA?.address) setSellerAddress(room.partyA.address);
    }
  }, [roomId, room?.partyB?.address, room?.partyA?.address, room?.notifyAddr, room?.creatorRole]);

  // Read USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, CONFIDENTIAL_ESCROW_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 3000 },
  });

  // Check if escrow already exists
  const { data: escrowData } = useReadContract({
    ...escrowConfig,
    functionName: "getEscrow",
    args: roomId.startsWith("0x") ? [roomId] : undefined,
    query: { enabled: roomId.startsWith("0x"), refetchInterval: 5000 },
  });
  const escrowStatus = escrowData ? Number((escrowData as any).status) : EscrowStatus.None;
  const alreadyDeposited = escrowStatus !== EscrowStatus.None;

  // Write: Approve USDC — guard with enabled so it doesn't fire prematurely
  const { writeContract: approveUsdc, data: approveTxHash, isPending: isApproving, reset: resetApprove } = useWriteContract();
  const { isLoading: isApproveLoading, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    query: { enabled: !!approveTxHash }, // CRITICAL: prevents false-positive loading state
  });

  // Write: Deposit Escrow
  const { writeContract: depositEscrow, data: depositTxHash, isPending: isDepositing, reset: resetDeposit } = useWriteContract();
  const { isLoading: isDepositLoading, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositTxHash,
    query: { enabled: !!depositTxHash }, // CRITICAL: prevents false-positive loading state
  });

  // After deposit confirmed — go back to floor lock page
  useEffect(() => {
    if (isDepositSuccess) {
      setStep("done");
      setTimeout(() => navigate("/create"), 2200);
    }
  }, [isDepositSuccess]);

  // After approval confirmed — call depositEscrow DIRECTLY (avoid stale closure from handleDeposit())
  useEffect(() => {
    if (!isApproveSuccess || !sellerAddress || amountBigInt === 0n) return;
    refetchAllowance();
    setStep("depositing");
    depositEscrow({
      address: CONFIDENTIAL_ESCROW_ADDRESS,
      abi: CONFIDENTIAL_ESCROW_ABI,
      functionName: "depositEscrow",
      args: [roomId, amountBigInt, sellerAddress as `0x${string}`],
    });
  }, [isApproveSuccess]);

  const hasEnoughAllowance = (allowance ?? 0n) >= amountBigInt && amountBigInt > 0n;
  const balanceFormatted = usdcBalance ? parseFloat(formatUnits(usdcBalance as bigint, 6)).toFixed(2) : "0.00";

  const handleApprove = () => {
    if (!sellerAddress || !sellerAddress.startsWith("0x")) return setError("Enter the seller wallet address");
    if (amountBigInt === 0n) return setError("No price found — go back and set your floor price first");
    setError("");
    setStep("approving");
    approveUsdc({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [CONFIDENTIAL_ESCROW_ADDRESS, amountBigInt],
    });
  };

  const handleDeposit = () => {
    if (!sellerAddress || !sellerAddress.startsWith("0x")) return setError("Enter the seller wallet address");
    if (amountBigInt === 0n) return;
    depositEscrow({
      address: CONFIDENTIAL_ESCROW_ADDRESS,
      abi: CONFIDENTIAL_ESCROW_ABI,
      functionName: "depositEscrow",
      args: [roomId, amountBigInt, sellerAddress as `0x${string}`],
    });
  };

  const handleSkip = () => {
    // Navigate back to CreateRoom — the floor-lock state will be restored via localStorage
    navigate("/create");
  };

  const isProcessing = isApproving || isApproveLoading || isDepositing || isDepositLoading;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-16 px-6 max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0, 0, 1] }}
          className="pt-8 space-y-4"
        >
          {/* Back button */}
          <button onClick={handleSkip}
            className="flex items-center gap-1.5 text-[13px] text-foreground/40 hover:text-foreground/70 transition-colors mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Floor Lock
          </button>

          {/* Header */}
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.25)" }}>
              <Lock className="w-8 h-8 text-[#0a84ff]" strokeWidth={1.5} />
            </div>
            <h1 className="sf-display text-[28px] text-foreground mb-2">Lock Your Capital</h1>
            <p className="text-[14px] text-foreground/40 max-w-sm mx-auto leading-relaxed">
              Your funds are automatically settled to the seller on a deal match, or fully refunded if there's no overlap.
            </p>
          </div>

          {/* Already deposited */}
          {alreadyDeposited && (
            <div className="apple-card p-5" style={{ borderColor: "rgba(48,209,88,0.25)", background: "rgba(48,209,88,0.04)" }}>
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle2 className="w-5 h-5 text-[#30d158]" />
                <div>
                  <p className="text-[14px] font-semibold text-foreground">Escrow Already Active</p>
                  <p className="text-[12px] text-foreground/40">
                    {escrowStatus === EscrowStatus.Settled ? "Settled — funds transferred." :
                      escrowStatus === EscrowStatus.Refunded ? "Refunded — funds returned to you." :
                        "Capital locked. Waiting for negotiation."}
                  </p>
                </div>
              </div>
              <button onClick={handleSkip} className="btn-apple w-full py-3 text-[14px] flex items-center justify-center gap-2">
                Back to Floor Lock <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Done — after deposit */}
          {step === "done" && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="apple-card p-8 text-center" style={{ borderColor: "rgba(48,209,88,0.25)", background: "rgba(48,209,88,0.04)" }}>
              <CheckCircle2 className="w-14 h-14 text-[#30d158] mx-auto mb-4" />
              <h2 className="sf-display text-[24px] text-foreground mb-2">Escrow Locked</h2>
              <p className="text-[13px] text-foreground/40 mb-2 leading-relaxed">
                Your USDC is secured on-chain. Returning to your room…
              </p>
              {depositTxHash && (
                <a href={getExplorerTxUrl(depositTxHash)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-[12px] text-[#0a84ff] hover:underline">
                  <ExternalLink className="w-3 h-3" /> View Transaction
                </a>
              )}
            </motion.div>
          )}

          {!alreadyDeposited && step !== "done" && (
            <>
              {!isViewerBuyer ? (
                <div className="apple-card p-6 text-center space-y-4" style={{ borderColor: "rgba(255,214,10,0.2)", background: "rgba(255,214,10,0.02)" }}>
                  <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-[rgba(255,214,10,0.08)] border border-[rgba(255,214,10,0.15)]">
                    <AlertCircle className="w-6 h-6 text-[#ffd60a]" />
                  </div>
                  <h2 className="sf-display text-[18px] text-foreground font-semibold">You are the Seller</h2>
                  <p className="text-[13px] text-foreground/45 leading-relaxed max-w-sm mx-auto">
                    Only the buyer is required to commit and lock capital in the escrow contract. As the seller, you do not need to deposit any funds. You will automatically receive the agreed payment on a successful match.
                  </p>
                  <button onClick={handleSkip} className="btn-apple w-full py-3 text-[14px]">
                    Back to Room
                  </button>
                </div>
              ) : (
                <>
                  {/* How it works */}
              <div className="apple-card p-5 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/30">How Escrow Works</p>
                {[
                  { icon: Lock,         text: "Your USDC is locked in the smart contract before negotiations begin." },
                  { icon: ShieldCheck,  text: "If prices match, the agreed midpoint is sent to the seller automatically." },
                  { icon: Wallet,       text: "The remaining balance is refunded to you immediately." },
                  { icon: AlertCircle, text: "If no deal is reached, your full deposit is returned. Zero information leaked." },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "rgba(10,132,255,0.08)", border: "1px solid rgba(10,132,255,0.15)" }}>
                      <Icon className="w-3.5 h-3.5 text-[#0a84ff]" />
                    </div>
                    <p className="text-[13px] text-foreground/60 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              {/* Seller address */}
              <div className="apple-card p-5 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/30">Seller Wallet Address</p>
                <input
                  type="text"
                  value={sellerAddress}
                  onChange={e => setSellerAddress(e.target.value)}
                  placeholder="0x…"
                  className="font-mono text-[13px] w-full bg-transparent border-0 outline-none text-foreground/80 placeholder:text-foreground/20"
                />
                <p className="text-[11px] text-foreground/30">This wallet receives the agreed amount on a successful match.</p>
              </div>

              {/* Deposit amount — READ ONLY, pre-filled from floor price */}
              <div className="apple-card p-5 space-y-2" style={{ borderColor: "rgba(10,132,255,0.2)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/30">Deposit Amount (USDC)</p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(48,209,88,0.1)", color: "#30d158", border: "1px solid rgba(48,209,88,0.2)" }}>
                    From Your Price
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-foreground/25" />
                  <div className="flex-1 text-[20px] font-semibold text-foreground sf-display">
                    {formatPriceDisplay(floorPrice, priceUnit)}
                  </div>
                  <span className="text-[12px] text-foreground/30 font-semibold">USDC</span>
                </div>
                <p className="text-[11px] text-foreground/30">
                  This is the {room?.creatorRole === "buyer" ? "ceiling" : "floor"} price you set during negotiation setup. It cannot be changed here.
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-foreground/25">Your USDC balance</span>
                  <span className="text-[11px] text-foreground/40 font-mono">{balanceFormatted} USDC</span>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-[13px] text-[#ff453a] px-1">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              {/* Step indicator */}
              {isProcessing && (
                <div className="apple-card p-4 flex items-center gap-3" style={{ borderColor: "rgba(10,132,255,0.2)" }}>
                  <div className="w-4 h-4 border-2 border-[#0a84ff]/30 border-t-[#0a84ff] rounded-full animate-spin shrink-0" />
                  <p className="text-[13px] text-foreground/60">
                    {step === "approving" ? "Approving USDC spend…" : "Locking escrow on-chain…"}
                  </p>
                </div>
              )}

              {/* CTA */}
              {!hasEnoughAllowance ? (
                <button
                  onClick={handleApprove}
                  disabled={isProcessing || amountBigInt === 0n}
                  className="btn-apple w-full py-4 text-[15px] flex items-center justify-center gap-2"
                >
                  {step === "approving" ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Approving USDC…</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4" /> Approve USDC</>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleDeposit}
                  disabled={isProcessing || amountBigInt === 0n}
                  className="btn-apple w-full py-4 text-[15px] flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #0a84ff, #30d158)" }}
                >
                  {step === "depositing" ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Locking Escrow…</>
                  ) : (
                  <><Lock className="w-4 h-4" /> Lock Escrow ({formatPriceDisplay(floorPrice, priceUnit)})</>
                  )}
                </button>
              )}

              <button onClick={handleSkip} disabled={isProcessing}
                className="btn-ghost w-full py-3 text-[14px]" style={{ opacity: isProcessing ? 0.4 : 1 }}>
                Skip — No Escrow
              </button>
                </>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
