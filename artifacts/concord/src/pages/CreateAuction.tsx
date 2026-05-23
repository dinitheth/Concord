import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, Copy, Wallet, ShieldCheck, ArrowRight, Send, Calendar, ChevronDown, Activity, Zap, Users, Gavel } from "lucide-react";
import { useAccount, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { useModal } from "connectkit";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";
import { NEGOTIATION_TYPES, saveAuction, type NegotiationType, type PriceUnit, type Auction } from "@/lib/concord";
import { encryptPrice, initFHE, type FHEStatus, type EncryptProgress } from "@/lib/fhe";
import { MULTI_PARTY_AUCTION_ABI, MULTI_PARTY_AUCTION_ADDRESS, generateRoomIdBytes32, roomIdToCode, getExplorerTxUrl } from "@/lib/contracts";

const LABEL_STYLE = {
  fontSize: 10, fontWeight: 700, color: "hsl(var(--foreground))", opacity: 0.75,
  textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12,
  display: "flex", alignItems: "center", gap: 8
};

export default function CreateAuction() {
  const [, navigate] = useLocation();
  const { address: wagmiAddress, isConnected: walletConnected } = useAccount();
  useDisconnect();
  const walletAddr = wagmiAddress ?? "";
  const { setOpen: openWalletModal } = useModal();

  const [type, setType] = useState<NegotiationType>("ma");
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("M");
  const [maxBidders, setMaxBidders] = useState(5);
  const [encStatus, setEncStatus] = useState<"idle" | "encrypting" | "done">("idle");
  const [fheStatus, setFHEStatus] = useState<FHEStatus>("idle");
  const [auctionId, setAuctionId] = useState("");
  const [auctionConfirmed, setAuctionConfirmed] = useState(false);
  const [dealName, setDealName] = useState("");
  const [dealDesc, setDealDesc] = useState("");
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [encryptStep, setEncryptStep] = useState("");
  const [txHash, setTxHash] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, string>>({});

  // Invite state
  const [recipientInput, setRecipientInput] = useState("");
  const [inviteState, setInviteState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState("");
  const [invitedAddresses, setInvitedAddresses] = useState<string[]>([]);

  const meta = NEGOTIATION_TYPES[type];
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const toggleTerm = (t: string) => {
    setSelectedTerms(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleSubmit = async () => {
    if (!price || !walletConnected || !publicClient || !walletClient) return;
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return;

    setEncStatus("encrypting");
    setFHEStatus("encrypting");

    const stepLabels: Record<string, string> = {
      InitTfhe: "Loading TFHE engine",
      FetchKeys: "Fetching FHE keys from network",
      Pack: "Packing encrypted input",
      Prove: "Generating ZK proof",
      Verify: "Verifying with CoFHE network",
    };

    try {
      setEncryptStep("Initializing FHE");
      await initFHE(publicClient, walletClient);

      setEncryptStep("Encrypting floor price");
      const encrypted = await encryptPrice(BigInt(Math.round(parsedPrice)), (progress) => {
        if (progress.isStart) {
          setEncryptStep(stepLabels[progress.step] || progress.step);
        }
      });

      const auctionIdHex = generateRoomIdBytes32();
      setAuctionId(auctionIdHex);

      const nTypeIndex = (["ma", "salary", "realestate", "custom"] as const).indexOf(type);
      const deadlineTs = deadline
        ? BigInt(Math.floor(new Date(deadline).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);

      setEncryptStep("Submitting to blockchain…");
      const hash = await walletClient.writeContract({
        address: MULTI_PARTY_AUCTION_ADDRESS,
        abi: MULTI_PARTY_AUCTION_ABI,
        functionName: "createAuction",
        args: [auctionIdHex, (encrypted as any).encryptedInput, nTypeIndex, deadlineTs, maxBidders],
        chain: walletClient.chain,
        account: walletClient.account,
      });
      setTxHash(hash);

      saveAuction({
        id: auctionIdHex,
        auctionIdHex,
        type,
        label: meta.label,
        status: "bidding",
        sellerPrice: parsedPrice,
        sellerPriceUnit: priceUnit,
        dealName: dealName || undefined,
        dealDesc: dealDesc || undefined,
        selectedTerms: selectedTerms.length > 0 ? selectedTerms : undefined,
        maxBidders,
        bids: [],
        seller: { address: walletAddr, timestamp: Date.now() },
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        createdAt: Date.now(),
        deadline: Number(deadlineTs) * 1000,
        txHash: hash,
      });

      setEncStatus("done");
      setEncryptStep("Confirming on-chain…");
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setAuctionConfirmed(true);
      setEncryptStep("");
    } catch (error: any) {
      console.error("[CreateAuction] Error:", error);
      if (error?.message?.includes("User rejected")) { /* silent */ }
      else if (error?.message?.includes("ProviderNotFound")) {
        alert("Wallet connection lost. Reconnect and try again.");
      }
      setFHEStatus("idle");
      setEncStatus("idle");
      setEncryptStep("");
    }
  };

  const sendInviteOnChain = async () => {
    if (!recipientInput.trim() || !walletClient || !publicClient || !auctionId) return;
    const recipient = recipientInput.trim();
    if (!recipient.startsWith("0x") || recipient.length !== 42) {
      setInviteError("Enter a valid wallet address (0x…, 42 chars)");
      return;
    }
    setInviteState("sending");
    setInviteError("");
    try {
      const hash = await walletClient.writeContract({
        address: MULTI_PARTY_AUCTION_ADDRESS,
        abi: MULTI_PARTY_AUCTION_ABI,
        functionName: "sendInvite",
        args: [auctionId as `0x${string}`, recipient as `0x${string}`],
        chain: walletClient.chain,
        account: walletClient.account,
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setInviteState("sent");
      setInvitedAddresses(prev => [...prev, recipient]);
      setRecipientInput("");
      setTimeout(() => setInviteState("idle"), 2000);
    } catch (err: any) {
      setInviteError(err?.shortMessage ?? "Transaction failed");
      setInviteState("error");
    }
  };

  // ── Pre-submit form ───────────────────────────────────────────
  if (encStatus === "idle") {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="pt-20 pb-16 px-6 max-w-xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: "rgba(255,149,0,0.1)", border: "1px solid rgba(255,149,0,0.2)" }}>
                <Gavel className="w-3.5 h-3.5 text-[#ff9500]" />
                <span className="text-[11px] font-bold text-[#ff9500] uppercase tracking-wider">Sealed-Bid Auction</span>
              </div>
              <h1 className="text-[28px] font-bold text-foreground mb-2">Create Auction</h1>
              <p className="text-[14px] text-foreground/40">Multiple bidders compete with encrypted bids against your floor price.</p>
            </div>

            {/* Type selector */}
            <div style={LABEL_STYLE}><Activity className="w-3.5 h-3.5" /> Deal Type</div>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {(Object.keys(NEGOTIATION_TYPES) as NegotiationType[]).map(k => (
                <button key={k} onClick={() => setType(k)}
                  className="apple-card px-4 py-3 text-left transition-all duration-200"
                  style={{
                    background: type === k ? "rgba(255,149,0,0.08)" : undefined,
                    borderColor: type === k ? "rgba(255,149,0,0.5)" : undefined,
                    boxShadow: type === k ? "0 0 20px rgba(255,149,0,0.08), inset 0 0 0 1px rgba(255,149,0,0.15)" : undefined,
                  }}>
                  <div className="text-[13px] font-semibold" style={{ color: type === k ? "#ff9500" : "hsl(var(--foreground))" }}>{NEGOTIATION_TYPES[k].label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: type === k ? "rgba(255,149,0,0.6)" : "hsl(var(--foreground) / 0.4)" }}>{NEGOTIATION_TYPES[k].description}</div>
                </button>
              ))}
            </div>

            {/* Deal name */}
            <div style={LABEL_STYLE}>Deal Title</div>
            <input value={dealName} onChange={e => setDealName(e.target.value)}
              placeholder={meta.titlePlaceholder}
              className="w-full apple-card px-4 py-3 text-[14px] text-foreground bg-transparent mb-4 outline-none placeholder:text-foreground/20" />

            {/* Deal description */}
            <div style={LABEL_STYLE}>Description</div>
            <textarea value={dealDesc} onChange={e => setDealDesc(e.target.value)}
              placeholder={meta.descPlaceholder} rows={2}
              className="w-full apple-card px-4 py-3 text-[14px] text-foreground bg-transparent mb-4 outline-none resize-none placeholder:text-foreground/20" />

            {/* Industry-specific fields */}
            {meta.dashboardFields.length > 0 && (
              <>
                <div style={LABEL_STYLE}><Zap className="w-3.5 h-3.5" /> {meta.label} Details</div>
                <div className="space-y-3 mb-4">
                  {meta.dashboardFields.map(field => (
                    <div key={field.key}>
                      <label className="text-[11px] text-foreground/50 font-medium mb-1 block">{field.label}</label>
                      {field.type === "select" ? (
                        <select value={metadata[field.key] || ""} onChange={e => setMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full apple-card px-4 py-2.5 text-[13px] text-foreground bg-transparent outline-none">
                          <option value="">{field.placeholder}</option>
                          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input type={field.type} value={metadata[field.key] || ""} onChange={e => setMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="w-full apple-card px-4 py-2.5 text-[13px] text-foreground bg-transparent outline-none placeholder:text-foreground/20" />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Floor price */}
            <div style={LABEL_STYLE}><Lock className="w-3.5 h-3.5" /> Your Floor Price (Minimum)</div>
            <div className="flex gap-2 mb-4">
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                placeholder={meta.placeholder}
                className="flex-1 apple-card px-4 py-3 text-[16px] font-semibold text-foreground bg-transparent outline-none placeholder:text-foreground/20" />
              <select value={priceUnit} onChange={e => setPriceUnit(e.target.value as PriceUnit)}
                className="apple-card px-3 py-3 text-[13px] text-foreground bg-transparent outline-none font-semibold">
                <option value="M">M</option><option value="K">K</option><option value="B">B</option><option value="USD">USD</option>
              </select>
            </div>

            {/* Max bidders slider */}
            <div style={LABEL_STYLE}><Users className="w-3.5 h-3.5" /> Maximum Bidders</div>
            <div className="apple-card px-4 py-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[13px] text-foreground/60">Bidder slots</span>
                <span className="text-[18px] font-bold text-[#ff9500]">{maxBidders}</span>
              </div>
              <input type="range" min={2} max={10} value={maxBidders} onChange={e => setMaxBidders(Number(e.target.value))}
                className="w-full accent-[#ff9500]" />
              <div className="flex justify-between text-[10px] text-foreground/30 mt-1"><span>2</span><span>10</span></div>
            </div>

            {/* Terms */}
            <div style={LABEL_STYLE}>Deal Terms</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {meta.terms.map(t => (
                <button key={t} onClick={() => toggleTerm(t)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${selectedTerms.includes(t) ? "bg-[rgba(255,149,0,0.15)] text-[#ff9500] border border-[rgba(255,149,0,0.3)]" : "bg-[var(--subtle-bg)] text-foreground/40 border border-transparent"}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Deadline */}
            <div style={LABEL_STYLE}><Calendar className="w-3.5 h-3.5" /> Bidding Deadline</div>
            <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full apple-card px-4 py-3 text-[13px] text-foreground bg-transparent mb-6 outline-none" />

            {/* Wallet + Submit */}
            {!walletConnected ? (
              <button onClick={() => openWalletModal(true)} className="btn-apple w-full py-3.5 text-[14px] flex items-center justify-center gap-2">
                <Wallet className="w-4 h-4" /> Connect Wallet
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={!price || parseFloat(price) <= 0}
                className="btn-apple w-full py-3.5 text-[14px] flex items-center justify-center gap-2 disabled:opacity-30">
                <Lock className="w-4 h-4" /> Encrypt Floor & Create Auction
              </button>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Encrypting state ──────────────────────────────────────────
  if (encStatus === "encrypting") {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="pt-20 pb-16 px-6 max-w-xl mx-auto flex flex-col items-center justify-center gap-4" style={{ minHeight: "60vh" }}>
          <div className="w-10 h-10 border-3 border-[#ff9500]/30 border-t-[#ff9500] rounded-full animate-spin" />
          <div className="text-[14px] text-foreground/60 font-medium">{encryptStep || "Encrypting…"}</div>
          <FHEBadge />
        </div>
      </div>
    );
  }

  // ── Auction created — show invite UI ──────────────────────────
  const displayCode = auctionId ? roomIdToCode(auctionId as `0x${string}`) : "";
  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-16 px-6 max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>

          {/* Success header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[rgba(48,209,88,0.12)] border border-[rgba(48,209,88,0.25)]">
              <Check className="w-5 h-5 text-[#30d158]" />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-foreground">Auction Created</h2>
              <p className="text-[12px] text-foreground/40">Your floor price is encrypted on-chain. Invite bidders below.</p>
            </div>
          </div>

          {/* Auction info card */}
          <div className="apple-card p-5 mb-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-[10px] font-bold text-[#ff9500] uppercase tracking-wider bg-[rgba(255,149,0,0.1)] px-2 py-0.5 rounded">{meta.label}</span>
                <div className="text-[14px] font-semibold text-foreground mt-2">{dealName || "Untitled Auction"}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-foreground/30 uppercase">Max Bidders</div>
                <div className="text-[18px] font-bold text-[#ff9500]">{maxBidders}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(48,209,88,0.08)", border: "1px solid rgba(48,209,88,0.15)" }}>
              <ShieldCheck className="w-3.5 h-3.5 text-[#30d158]" />
              <span className="text-[12px] text-[#30d158]/80">Floor price encrypted — invisible to all bidders</span>
            </div>
          </div>

          {/* Auction ID */}
          <div className="apple-card p-4 mb-4">
            <div className="text-[10px] text-foreground/30 uppercase tracking-wider mb-2">Auction ID</div>
            <div className="flex items-center gap-2">
              <code className="text-[12px] text-foreground/60 font-mono flex-1 break-all">{auctionId}</code>
              <button onClick={() => { navigator.clipboard.writeText(auctionId); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors">
                {codeCopied ? <Check className="w-3.5 h-3.5 text-[#30d158]" /> : <Copy className="w-3.5 h-3.5 text-foreground/30" />}
              </button>
            </div>
          </div>

          {/* Invite section */}
          <div style={LABEL_STYLE}><Send className="w-3.5 h-3.5" /> Invite Bidders</div>
          <div className="apple-card p-4 mb-4">
            <input value={recipientInput} onChange={e => setRecipientInput(e.target.value)}
              placeholder="Bidder wallet address (0x…)"
              className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-foreground/20 mb-3" />
            {inviteError && <div className="text-[11px] text-red-400 mb-2">{inviteError}</div>}
            <button onClick={sendInviteOnChain} disabled={inviteState === "sending" || !auctionConfirmed}
              className="btn-apple w-full py-2.5 text-[13px] flex items-center justify-center gap-2 disabled:opacity-30">
              {inviteState === "sending" ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</> :
               inviteState === "sent" ? <><Check className="w-3.5 h-3.5" /> Sent!</> :
               <><Send className="w-3.5 h-3.5" /> Send On-Chain Invite</>}
            </button>
            {invitedAddresses.length > 0 && (
              <div className="mt-3 space-y-1">
                {invitedAddresses.map((addr, i) => (
                  <div key={i} className="text-[11px] text-[#30d158]/60 flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" /> {addr.slice(0, 8)}…{addr.slice(-4)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open auction room */}
          <button onClick={() => navigate(`/auction/${auctionId}`)}
            className="btn-apple w-full py-3.5 text-[14px] flex items-center justify-center gap-2 mb-3">
            Open Auction Room <ArrowRight className="w-4 h-4" />
          </button>

          <button onClick={() => { setEncStatus("idle"); setAuctionId(""); setAuctionConfirmed(false); }}
            className="w-full text-center text-[13px] text-foreground/30 hover:text-foreground/50 transition-colors py-2">
            New Auction
          </button>
        </motion.div>
      </div>
    </div>
  );
}
