import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, Copy, Wallet, ShieldCheck, ArrowRight, Send, Calendar, Activity, Zap, Users, Gavel, Clipboard, AlertCircle, Loader2 } from "lucide-react";
import { useAccount, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { useModal } from "connectkit";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";
import { NEGOTIATION_TYPES, saveAuction, type NegotiationType, type PriceUnit } from "@/lib/concord";
import { encryptPrice, initFHE, type FHEStatus } from "@/lib/fhe";
import { MULTI_PARTY_AUCTION_ABI, MULTI_PARTY_AUCTION_ADDRESS, generateRoomIdBytes32, roomIdToCode } from "@/lib/contracts";

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
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Batch bidder address inputs ───────────────────────────────
  const [bidderAddresses, setBidderAddresses] = useState<string[]>(Array(5).fill(""));
  const [invitedCount, setInvitedCount] = useState(0);
  const [invitedAddresses, setInvitedAddresses] = useState<string[]>([]);
  const [failedInviteAddresses, setFailedInviteAddresses] = useState<string[]>([]);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  const meta = NEGOTIATION_TYPES[type];
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Resize bidder address array when maxBidders changes
  useEffect(() => {
    setBidderAddresses(prev => {
      const next = Array(maxBidders).fill("");
      for (let i = 0; i < Math.min(prev.length, maxBidders); i++) {
        next[i] = prev[i];
      }
      return next;
    });
  }, [maxBidders]);

  const toggleTerm = (t: string) => {
    setSelectedTerms(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleAddressChange = (index: number, value: string) => {
    setBidderAddresses(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handlePaste = async (index: number) => {
    try {
      const text = await navigator.clipboard.readText();
      handleAddressChange(index, text.trim());
    } catch (e) {
      // Clipboard access denied — ignore
    }
  };

  // ── Submit: create auction + send all invites ─────────────────
  const handleSubmit = async () => {
    if (!price || !walletConnected || !publicClient || !walletClient) return;
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return;

    setEncStatus("encrypting");
    setFHEStatus("encrypting");
    setFailedInviteAddresses([]);
    setInviteStatus("idle");

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

      setEncryptStep("Submitting auction to blockchain…");
      const hash = await walletClient.writeContract({
        address: MULTI_PARTY_AUCTION_ADDRESS,
        abi: MULTI_PARTY_AUCTION_ABI,
        functionName: "createAuction",
        args: [auctionIdHex, (encrypted as any).encryptedInput, nTypeIndex, deadlineTs, maxBidders],
        chain: walletClient.chain,
        account: walletClient.account,
      });
      setTxHash(hash);

      const cleanMetadata: Record<string, string> = {};
      Object.keys(metadata).forEach(k => {
        const val = metadata[k];
        const fieldDef = meta.dashboardFields.find(f => f.key === k);
        if (fieldDef && fieldDef.type === "currency") {
          const units = fieldDef.units || ["USD", "K", "M", "B"];
          const matchedUnit = units.find(u => val.endsWith(u));
          const numPart = matchedUnit ? val.slice(0, -matchedUnit.length) : val;
          if (numPart.trim()) {
            cleanMetadata[k] = val;
          }
        } else if (val && val.trim()) {
          cleanMetadata[k] = val;
        }
      });

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
        metadata: Object.keys(cleanMetadata).length > 0 ? cleanMetadata : undefined,
        createdAt: Date.now(),
        deadline: Number(deadlineTs) * 1000,
        txHash: hash,
      });

      setEncryptStep("Confirming auction on-chain…");
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setAuctionConfirmed(true);

      // ── Automatically send invites to all valid addresses ──────
      const uniqueAddresses = Array.from(new Set(
        bidderAddresses
          .map(a => a.trim())
          .filter(a => a.startsWith("0x") && a.length === 42 && a.toLowerCase() !== walletAddr.toLowerCase())
      )) as `0x${string}`[];

      if (uniqueAddresses.length > 0) {
        try {
          setEncryptStep("Syncing blockchain state…");
          await new Promise(resolve => setTimeout(resolve, 4000));

          setEncryptStep(`Sending batch invites to ${uniqueAddresses.length} bidders…`);
          setInviteStatus("sending");
          const invHash = await walletClient.writeContract({
            address: MULTI_PARTY_AUCTION_ADDRESS,
            abi: MULTI_PARTY_AUCTION_ABI,
            functionName: "sendBatchInvites",
            args: [auctionIdHex as `0x${string}`, uniqueAddresses],
            chain: walletClient.chain,
            account: walletClient.account,
            gas: 500000n, // Bypass gas estimation failure due to node sync lag
          });
          await publicClient.waitForTransactionReceipt({ hash: invHash, confirmations: 1 });
          setInvitedCount(uniqueAddresses.length);
          setInvitedAddresses(uniqueAddresses);
          setFailedInviteAddresses([]);
          setInviteStatus("done");
        } catch (err: any) {
          console.error(`[CreateAuction] Batch invites failed:`, err);
          setFailedInviteAddresses(uniqueAddresses);
          setInviteStatus("error");
        }
      }

      setEncStatus("done");
      setEncryptStep("");
    } catch (error: any) {
      console.error("[CreateAuction] Error:", error);
      const msg = error?.message || "";
      const isModuleErr = msg.includes("dynamically imported module") || msg.includes("Failed to fetch") || msg.includes("preload") || msg.includes("MIME type");
      if (isModuleErr) {
        alert("A new version of Concord was deployed or encryption modules failed to load. The page will reload to load the latest encryption modules.");
        window.location.reload();
      } else if (error?.message?.includes("ProviderNotFound") || error?.message?.includes("Provider not found")) {
        alert("Wallet connection was lost during encryption. Please reconnect your wallet and try again.");
      } else if (error?.message?.includes("User rejected") || error?.message?.includes("user rejected")) {
        // User cancelled the tx in their wallet — just reset silently
      } else {
        alert(`Encryption or auction creation failed: ${msg.length > 200 ? msg.slice(0, 200) + "…" : msg}`);
      }
      setFHEStatus("idle");
      setEncStatus("idle");
      setEncryptStep("");
    }
  };

  const sendInvitesManually = async () => {
    if (!walletClient || !publicClient || failedInviteAddresses.length === 0 || !auctionId) return;
    setInviteStatus("sending");
    try {
      const uniqueAddresses = failedInviteAddresses as `0x${string}`[];
      const invHash = await walletClient.writeContract({
        address: MULTI_PARTY_AUCTION_ADDRESS,
        abi: MULTI_PARTY_AUCTION_ABI,
        functionName: "sendBatchInvites",
        args: [auctionId as `0x${string}`, uniqueAddresses],
        chain: walletClient.chain,
        account: walletClient.account,
        gas: 500000n, // Bypass gas estimation failure
      });
      await publicClient.waitForTransactionReceipt({ hash: invHash, confirmations: 1 });
      setInvitedCount(uniqueAddresses.length);
      setInvitedAddresses(uniqueAddresses);
      setFailedInviteAddresses([]);
      setInviteStatus("done");
    } catch (err: any) {
      console.error("[CreateAuction] Manual batch invites failed:", err);
      setInviteStatus("error");
      const msg = err?.message || "";
      alert(`Failed to send invites: ${msg.length > 200 ? msg.slice(0, 200) + "…" : msg}`);
    }
  };

  // ── Pre-submit form ───────────────────────────────────────────
  if (encStatus === "idle") {
    const uniqueAddressesForDisplay = Array.from(new Set(
      bidderAddresses
        .map(a => a.trim())
        .filter(a => a.startsWith("0x") && a.length === 42 && a.toLowerCase() !== walletAddr.toLowerCase())
    ));
    const validCount = uniqueAddressesForDisplay.length;

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
                      ) : field.type === "currency" ? (
                        (() => {
                          const units = field.units || ["USD", "K", "M", "B"];
                          const val = metadata[field.key] || "";
                          let numValue = "";
                          let unitValue = units[0] || "M";
                          const matchedUnit = units.find(u => val.endsWith(u));
                          if (matchedUnit) {
                            unitValue = matchedUnit;
                            numValue = val.slice(0, -matchedUnit.length);
                          } else if (val) {
                            numValue = val;
                          }

                          const handleNumChange = (newNum: string) => {
                            if (!newNum) {
                              setMetadata(prev => {
                                const next = { ...prev };
                                delete next[field.key];
                                return next;
                              });
                            } else {
                              setMetadata(prev => ({ ...prev, [field.key]: `${newNum}${unitValue}` }));
                            }
                          };

                          const handleUnitChange = (newUnit: string) => {
                            setMetadata(prev => ({ ...prev, [field.key]: `${numValue}${newUnit}` }));
                          };

                          return (
                            <div className="flex gap-2">
                              <input type="number" step="any" value={numValue} onChange={e => handleNumChange(e.target.value)}
                                placeholder={field.placeholder}
                                className="flex-1 apple-card px-4 py-2.5 text-[13px] text-foreground bg-transparent outline-none placeholder:text-foreground/20" />
                              <select value={unitValue} onChange={e => handleUnitChange(e.target.value)}
                                className="apple-card px-3 py-2.5 text-[13px] text-foreground bg-transparent outline-none w-[90px] text-center">
                                {units.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                          );
                        })()
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
              <input type="range" min={1} max={10} value={maxBidders} onChange={e => setMaxBidders(Number(e.target.value))}
                className="w-full accent-[#ff9500]" />
              <div className="flex justify-between text-[10px] text-foreground/30 mt-1"><span>1</span><span>10</span></div>
            </div>

            {/* ── Bidder Wallet Address Inputs ───────────────────── */}
            <div style={LABEL_STYLE}><Send className="w-3.5 h-3.5" /> Invite Bidders ({maxBidders} slots)</div>
            <div className="apple-card p-4 mb-6">
              <p className="text-[11px] text-foreground/30 mb-3 leading-relaxed">
                Paste each bidder's wallet address below. All invites will be sent on-chain automatically when you create the auction.
              </p>
              <div className="space-y-2.5">
                {bidderAddresses.map((addr, i) => {
                  const isValid = addr.trim().startsWith("0x") && addr.trim().length === 42;
                  const isEmpty = !addr.trim();
                  
                  // Check if it's the seller (self-invite)
                  const isSelf = addr.trim().toLowerCase() === walletAddr.toLowerCase();
                  
                  // Check if duplicate of another field
                  const isDuplicate = addr.trim() && bidderAddresses.findIndex((a, idx) => a.trim().toLowerCase() === addr.trim().toLowerCase() && idx !== i) !== -1;
                  
                  const hasError = isSelf || isDuplicate;

                  return (
                    <div key={i} className="flex flex-col gap-1.5 mb-2">
                      <div className="flex items-center gap-2">
                        {/* Number badge */}
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-all duration-300"
                          style={{
                            background: hasError ? "rgba(255,59,48,0.12)" : isValid ? "rgba(48,209,88,0.12)" : "rgba(255,149,0,0.08)",
                            color: hasError ? "#ff3b30" : isValid ? "#30d158" : isEmpty ? "hsl(var(--foreground) / 0.25)" : "#ff9500",
                            border: hasError ? "1px solid rgba(255,59,48,0.3)" : isValid ? "1px solid rgba(48,209,88,0.3)" : "1px solid rgba(255,149,0,0.12)",
                          }}
                        >
                          {isValid && !hasError ? <Check className="w-3 h-3" /> : i + 1}
                        </div>

                        {/* Address input */}
                        <input
                          value={addr}
                          onChange={e => handleAddressChange(i, e.target.value)}
                          placeholder={`Bidder ${i + 1} wallet (0x…)`}
                          spellCheck={false}
                          className="flex-1 text-[12px] text-foreground font-mono outline-none placeholder:text-foreground/15 px-3 py-2.5 rounded-xl transition-all duration-200"
                          style={{
                            background: "var(--subtle-bg)",
                            border: hasError
                              ? "1px solid rgba(255,59,48,0.4)"
                              : isValid
                              ? "1px solid rgba(48,209,88,0.3)"
                              : addr.trim() && !isValid
                              ? "1px solid rgba(255,59,48,0.3)"
                              : "1px solid var(--card-border-color)",
                          }}
                        />

                        {/* Paste button */}
                        <button
                          onClick={() => handlePaste(i)}
                          className="px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all hover:brightness-125 shrink-0"
                          style={{
                            background: "rgba(10,132,255,0.08)",
                            border: "1px solid rgba(10,132,255,0.2)",
                            color: "#0a84ff",
                          }}
                        >
                          <Clipboard className="w-3 h-3" />
                          Paste
                        </button>
                      </div>

                      {/* Warnings */}
                      {addr.trim() && isSelf && (
                        <div className="text-[10px] text-[#ff3b30] ml-9 font-medium">
                          You cannot invite your own connected address as a bidder.
                        </div>
                      )}
                      {addr.trim() && isDuplicate && (
                        <div className="text-[10px] text-[#ff3b30] ml-9 font-medium">
                          Duplicate bidder address.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Valid count indicator */}
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--card-border-color)" }}>
                {validCount > 0 ? (
                  <span className="text-[11px] text-[#30d158]/70 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    {validCount} valid address{validCount !== 1 ? "es" : ""} — will receive on-chain invites
                  </span>
                ) : (
                  <span className="text-[11px] text-foreground/20">
                    No addresses entered yet — you can also invite bidders later
                  </span>
                )}
              </div>
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
              <button onClick={() => setShowConfirm(true)} disabled={!price || parseFloat(price) <= 0}
                className="btn-apple w-full py-3.5 text-[14px] flex items-center justify-center gap-2 disabled:opacity-30">
                <Lock className="w-4 h-4" />
                {validCount > 0
                  ? `Review & Create Auction (${validCount} Bidders)`
                  : "Review & Create Auction"}
              </button>
            )}
          </motion.div>

          {/* ── CONFIRMATION MODAL ────────────────────────────────────────── */}
          <AnimatePresence>
            {showConfirm && (
              <>
                {/* Backdrop */}
                <motion.div
                  key="confirm-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowConfirm(false)}
                  style={{
                    position: "fixed", inset: 0, zIndex: 100,
                    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)"
                  }}
                />

                {/* Centering wrapper */}
                <div style={{
                  position: "fixed", inset: 0, zIndex: 101,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  pointerEvents: "none", padding: 20,
                }}>
                  {/* Animated modal */}
                  <motion.div
                    key="confirm-sheet"
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 30, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 340, damping: 30 }}
                    style={{
                      width: "100%", maxWidth: 540, maxHeight: "85vh", overflowY: "auto",
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 24,
                      padding: "28px 28px 32px",
                      boxShadow: "0 32px 100px rgba(0,0,0,0.5)",
                      pointerEvents: "auto",
                    }}
                  >
                    {/* Handle */}
                    <div style={{ width: 36, height: 4, borderRadius: 99, background: "hsl(var(--muted-foreground))", margin: "0 auto 24px" }} />

                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Gavel style={{ width: 18, height: 18, color: "#ff9500" }} />
                      </div>
                      <div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: "hsl(var(--foreground))", margin: 0, lineHeight: 1.2 }}>Confirm Auction Details</h2>
                        <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>Review everything before encrypting your floor price</p>
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: "hsl(var(--muted-foreground))", marginBottom: 20 }} />

                    {/* Summary rows */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>

                      {/* Type */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Deal Type</span>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.25)", color: "#ff9500" }}>{meta.label}</span>
                      </div>

                      {/* Deal name */}
                      {dealName && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Deal Title</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>{dealName}</span>
                        </div>
                      )}

                      {/* Description */}
                      {dealDesc && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Description</span>
                          <span style={{ fontSize: 12, color: "hsl(var(--foreground))", lineHeight: 1.5, padding: "8px 12px", borderRadius: 10, background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}>{dealDesc}</span>
                        </div>
                      )}

                      {/* Terms */}
                      {selectedTerms.length > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>Terms</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "flex-end" }}>
                            {selectedTerms.map(t => (
                              <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(255,149,0,0.1)", border: "1px solid rgba(255,149,0,0.2)", color: "#ff9500" }}>{t}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Max Bidders */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Max Bidders</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>{maxBidders}</span>
                      </div>

                      {/* Bidders to Invite */}
                      {uniqueAddressesForDisplay.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Bidders to Invite ({uniqueAddressesForDisplay.length})</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 100, overflowY: "auto", padding: "8px 12px", borderRadius: 10, background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}>
                            {uniqueAddressesForDisplay.map((addr, idx) => (
                              <div key={idx} style={{ fontSize: 11, fontFamily: "monospace", color: "hsl(var(--foreground))", opacity: 0.7 }}>
                                {idx + 1}. {addr.slice(0, 12)}…{addr.slice(-6)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Deadline */}
                      {deadline && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Bidding Deadline</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>{new Date(deadline).toLocaleString()}</span>
                        </div>
                      )}

                      {/* Divider */}
                      <div style={{ height: 1, background: "hsl(var(--muted-foreground))" }} />

                      {/* Floor price */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 12, background: "rgba(255,149,0,0.06)", border: "1px solid rgba(255,149,0,0.18)" }}>
                        <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Floor Price (will be encrypted)</span>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "hsl(var(--foreground))", fontFamily: "monospace" }}>
                          ${price} <span style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>{priceUnit === "USD" ? "USD" : `${priceUnit} USD`}</span>
                        </span>
                      </div>

                    </div>

                    {/* Warning note */}
                    <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,159,10,0.07)", border: "1px solid rgba(255,159,10,0.18)", marginBottom: 20 }}>
                      <p style={{ fontSize: 11, color: "rgba(255,159,10,0.85)", lineHeight: 1.6, margin: 0 }}>
                        ⚠️  Once encrypted, your floor price cannot be changed. Make sure everything looks correct before confirming.
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={() => setShowConfirm(false)}
                        className="btn-ghost"
                        style={{ flex: 1, padding: "13px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        Go Back
                      </button>
                      <button
                        onClick={() => { setShowConfirm(false); handleSubmit(); }}
                        className="btn-apple"
                        style={{ flex: 2, padding: "13px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg, #ff9500, #ff5e00)", border: "none" }}
                      >
                        <Lock style={{ width: 15, height: 15 }} />
                        Confirm &amp; Encrypt Floor
                      </button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── Encrypting / Creating / Inviting state ────────────────────
  if (encStatus === "encrypting") {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="pt-20 pb-16 px-6 max-w-xl mx-auto flex flex-col items-center justify-center gap-4" style={{ minHeight: "60vh" }}>
          <div className="w-10 h-10 border-3 border-[#ff9500]/30 border-t-[#ff9500] rounded-full animate-spin" />
          <div className="text-[14px] text-foreground/60 font-medium text-center">{encryptStep || "Encrypting…"}</div>
          <FHEBadge />
        </div>
      </div>
    );
  }

  // ── Auction created — success screen ──────────────────────────
  const displayCode = auctionId ? roomIdToCode(auctionId as `0x${string}`) : "";
  const finalValidAddrs = bidderAddresses.map(a => a.trim()).filter(a => a.startsWith("0x") && a.length === 42);

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
              <p className="text-[12px] text-foreground/40">
                {invitedCount > 0
                  ? `Floor encrypted on-chain. ${invitedCount} bidder${invitedCount !== 1 ? "s" : ""} invited successfully.`
                  : "Your floor price is encrypted on-chain."}
              </p>
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

          {/* Failed invites retry section */}
          {failedInviteAddresses.length > 0 && (
            <div className="apple-card p-5 mb-4" style={{ borderColor: "rgba(255, 69, 58, 0.2)", background: "rgba(255, 69, 58, 0.03)" }}>
              <div className="text-[11px] font-bold text-[#ff453a] uppercase tracking-wider mb-2.5 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#ff453a]" /> Invites Failed to Send
              </div>
              <p className="text-[12px] text-foreground/60 mb-4 leading-relaxed">
                The auction was created successfully, but the invites could not be sent due to a temporary RPC rate limit. To invite these bidders so they can view the auction and submit their bids, please submit the invites transaction below:
              </p>
              <div className="space-y-1.5 mb-4 max-h-[120px] overflow-y-auto pr-1">
                {failedInviteAddresses.map((addr, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-foreground/5 border border-foreground/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ff453a]/50"></span>
                    <span className="text-[11px] text-foreground/60 font-mono flex-1 break-all">{addr}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={sendInvitesManually}
                disabled={inviteStatus === "sending"}
                className="w-full py-3 rounded-lg text-[13px] font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                style={{
                  background: inviteStatus === "sending" ? "rgba(255, 69, 58, 0.1)" : "rgba(255, 69, 58, 0.15)",
                  color: "#ff453a",
                  border: "1px solid rgba(255, 69, 58, 0.25)",
                }}
                onMouseEnter={(e) => {
                  if (inviteStatus !== "sending") {
                    e.currentTarget.style.background = "rgba(255, 69, 58, 0.25)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (inviteStatus !== "sending") {
                    e.currentTarget.style.background = "rgba(255, 69, 58, 0.15)";
                  }
                }}
              >
                {inviteStatus === "sending" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#ff453a]" /> Sending Invites…
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Send Invites Now
                  </>
                )}
              </button>
            </div>
          )}

          {/* Invited bidders summary */}
          {invitedAddresses.length > 0 && (
            <div className="apple-card p-4 mb-4">
              <div className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Send className="w-3.5 h-3.5" /> Invited Bidders
              </div>
              <div className="space-y-2">
                {invitedAddresses.map((addr, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(48,209,88,0.05)", border: "1px solid rgba(48,209,88,0.12)" }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[rgba(48,209,88,0.15)]">
                      <Check className="w-2.5 h-2.5 text-[#30d158]" />
                    </div>
                    <span className="text-[12px] text-foreground/60 font-mono">{addr.slice(0, 10)}…{addr.slice(-4)}</span>
                    <span className="text-[10px] text-[#30d158]/50 ml-auto">Invite sent</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-foreground/25 mt-3 leading-relaxed">
                Bidders will see this auction in their <strong>Inbox</strong> and can submit encrypted bids.
              </p>
            </div>
          )}

          {/* Open auction room */}
          <button onClick={() => navigate(`/auction/${auctionId}`)}
            className="btn-apple w-full py-3.5 text-[14px] flex items-center justify-center gap-2 mb-3">
            Open Auction Room <ArrowRight className="w-4 h-4" />
          </button>

          <button onClick={() => {
            setEncStatus("idle");
            setAuctionId("");
            setAuctionConfirmed(false);
            setBidderAddresses(Array(maxBidders).fill(""));
            setInvitedCount(0);
            setInvitedAddresses([]);
            setFailedInviteAddresses([]);
            setInviteStatus("idle");
          }}
            className="w-full text-center text-[13px] text-foreground/30 hover:text-foreground/50 transition-colors py-2">
            New Auction
          </button>
        </motion.div>
      </div>
    </div>
  );
}
