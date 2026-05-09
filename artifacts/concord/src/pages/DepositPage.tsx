import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { Lock, ShieldCheck, ArrowRight, Wallet, CheckCircle2, AlertCircle, ExternalLink, DollarSign } from "lucide-react";
import { useAccount, usePublicClient, useWalletClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import NavBar from "@/components/NavBar";
import {
  CONFIDENTIAL_ESCROW_ADDRESS, CONFIDENTIAL_ESCROW_ABI,
  USDC_ADDRESS, USDC_ABI,
  BLIND_NEGOTIATION_ADDRESS, BLIND_NEGOTIATION_ABI,
  escrowConfig, usdcConfig,
  formatUsdc, priceToUsdc,
  getEscrowExplorerUrl, getExplorerTxUrl,
  EscrowStatus,
} from "@/lib/contracts";
import { getRoom } from "@/lib/concord";

export default function DepositPage() {
  const [, params] = useRoute("/deposit/:id");
  const [, navigate] = useLocation();
  const roomId = (params?.id ?? "") as `0x${string}`;

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [step, setStep] = useState<"review" | "approve" | "deposit" | "done">("review");
  const [depositAmount, setDepositAmount] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [error, setError] = useState("");

  // Load room to pre-fill seller + suggested deposit
  const room = getRoom(roomId);
  useEffect(() => {
    if (room?.partyA?.address) setSellerAddress(room.partyA.address);
  }, [room]);

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
  const { data: escrow } = useReadContract({
    ...escrowConfig,
    functionName: "getEscrow",
    args: roomId.startsWith("0x") ? [roomId] : undefined,
    query: { enabled: roomId.startsWith("0x"), refetchInterval: 5000 },
  });

  // Write: Approve USDC
  const { writeContract: approveUsdc, data: approveTxHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveLoading, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Write: Deposit Escrow
  const { writeContract: depositEscrow, data: depositTxHash, isPending: isDepositing } = useWriteContract();
  const { isLoading: isDepositLoading, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositTxHash,
  });

  // Move to done once deposit confirmed
  useEffect(() => {
    if (isDepositSuccess) setStep("done");
  }, [isDepositSuccess]);

  // Move to deposit step once approval confirmed
  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance();
      setStep("deposit");
    }
  }, [isApproveSuccess]);

  const amountBigInt = depositAmount ? parseUnits(depositAmount, 6) : 0n;
  const hasEnoughAllowance = (allowance ?? 0n) >= amountBigInt && amountBigInt > 0n;
  const balanceFormatted = usdcBalance ? formatUnits(usdcBalance as bigint, 6) : "0";

  const handleApprove = () => {
    if (!depositAmount || amountBigInt === 0n) return setError("Enter a deposit amount");
    setError("");
    setStep("approve");
    approveUsdc({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [CONFIDENTIAL_ESCROW_ADDRESS, amountBigInt],
    });
  };

  const handleDeposit = () => {
    if (!sellerAddress || !sellerAddress.startsWith("0x")) return setError("Enter the seller wallet address");
    if (!depositAmount || amountBigInt === 0n) return setError("Enter a deposit amount");
    setError("");
    depositEscrow({
      address: CONFIDENTIAL_ESCROW_ADDRESS,
      abi: CONFIDENTIAL_ESCROW_ABI,
      functionName: "depositEscrow",
      args: [roomId, amountBigInt, sellerAddress as `0x${string}`],
    });
  };

  const escrowStatus = escrow ? Number((escrow as any).status) : EscrowStatus.None;
  const alreadyDeposited = escrowStatus !== EscrowStatus.None;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-16 px-6 max-w-xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0, 0, 1] }}
          className="pt-10 space-y-5"
        >
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.25)" }}>
              <Lock className="w-8 h-8 text-[#0a84ff]" strokeWidth={1.5} />
            </div>
            <h1 className="sf-display text-[28px] text-foreground mb-2">Lock Your Capital</h1>
            <p className="text-[14px] text-foreground/40 max-w-sm mx-auto leading-relaxed">
              Deposit your maximum capital into the on-chain escrow before the negotiation begins.
              Your funds are returned automatically if there's no match.
            </p>
          </div>

          {/* Already deposited */}
          {alreadyDeposited && (
            <div className="apple-card p-5" style={{ borderColor: "rgba(48,209,88,0.25)", background: "rgba(48,209,88,0.04)" }}>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#30d158]" />
                <div>
                  <p className="text-[14px] font-semibold text-foreground">Escrow Already Active</p>
                  <p className="text-[12px] text-foreground/40">
                    {escrowStatus === EscrowStatus.Settled ? "Settled — funds have been transferred." :
                      escrowStatus === EscrowStatus.Refunded ? "Refunded — funds returned to buyer." :
                        `Deposit locked. Waiting for negotiation to complete.`}
                  </p>
                </div>
              </div>
              {depositTxHash && (
                <a href={getEscrowExplorerUrl()} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12px] text-[#0a84ff] mt-3 hover:underline">
                  <ExternalLink className="w-3 h-3" /> View on Basescan
                </a>
              )}
            </div>
          )}

          {!alreadyDeposited && step !== "done" && (
            <>
              {/* How it works */}
              <div className="apple-card p-5 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/30">How Escrow Works</p>
                {[
                  { icon: Lock, text: "Your USDC is locked in the smart contract before negotiations begin." },
                  { icon: ShieldCheck, text: "If prices match, the agreed midpoint is sent to the seller automatically." },
                  { icon: Wallet, text: "The remaining balance is refunded to you immediately." },
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
              <div className="apple-card p-5 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/30">Seller Wallet Address</p>
                <input
                  type="text"
                  value={sellerAddress}
                  onChange={e => setSellerAddress(e.target.value)}
                  placeholder="0x..."
                  className="font-mono text-[13px] w-full bg-transparent border-0 outline-none text-foreground/80 placeholder:text-foreground/20"
                />
                <p className="text-[11px] text-foreground/30">The wallet that will receive the agreed amount on a successful match.</p>
              </div>

              {/* Amount */}
              <div className="apple-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/30">Deposit Amount (USDC)</p>
                  <span className="text-[11px] text-foreground/30">Balance: {parseFloat(balanceFormatted).toFixed(2)} USDC</span>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-foreground/25" />
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    placeholder="e.g. 95000000 (= $95M)"
                    className="flex-1 bg-transparent border-0 outline-none text-[15px] text-foreground placeholder:text-foreground/20"
                  />
                  <span className="text-[12px] text-foreground/30 font-semibold">USDC</span>
                </div>
                <p className="text-[11px] text-foreground/30">This should be your absolute maximum — the highest you'd pay.</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-[13px] text-[#ff453a] px-1">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {/* Actions */}
              {!hasEnoughAllowance ? (
                <button
                  onClick={handleApprove}
                  disabled={isApproving || isApproveLoading}
                  className="btn-apple w-full py-3.5 text-[15px] flex items-center justify-center gap-2"
                >
                  {isApproving || isApproveLoading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Approving USDC…</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4" /> Approve USDC</>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleDeposit}
                  disabled={isDepositing || isDepositLoading}
                  className="btn-apple w-full py-3.5 text-[15px] flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #0a84ff, #30d158)" }}
                >
                  {isDepositing || isDepositLoading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Locking Escrow…</>
                  ) : (
                    <><Lock className="w-4 h-4" /> Lock Escrow</>
                  )}
                </button>
              )}

              <button onClick={() => navigate(`/room/${roomId}`)}
                className="btn-ghost w-full py-3 text-[14px]">
                Skip — No Escrow
              </button>
            </>
          )}

          {/* Done */}
          {step === "done" && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="apple-card p-8 text-center" style={{ borderColor: "rgba(48,209,88,0.25)", background: "rgba(48,209,88,0.04)" }}>
              <CheckCircle2 className="w-12 h-12 text-[#30d158] mx-auto mb-4" />
              <h2 className="sf-display text-[22px] text-foreground mb-2">Escrow Locked</h2>
              <p className="text-[13px] text-foreground/40 mb-5 leading-relaxed">
                Your USDC is securely locked on-chain. It will be automatically released to the seller
                if a deal is found, or fully refunded to you if there's no match.
              </p>
              {depositTxHash && (
                <a href={getExplorerTxUrl(depositTxHash)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-[13px] text-[#0a84ff] mb-5 hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> View Deposit Transaction
                </a>
              )}
              <button onClick={() => navigate(`/room/${roomId}`)}
                className="btn-apple w-full py-3.5 text-[15px] flex items-center justify-center gap-2">
                Enter Negotiation Room <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
