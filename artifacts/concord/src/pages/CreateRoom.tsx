import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, Copy, Wallet, ShieldCheck, ArrowRight, Send, Calendar, Bell, ChevronDown, Activity, Zap, Fingerprint, FileText, CheckCircle2, User } from "lucide-react";
import { useAccount, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { useModal } from "connectkit";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";
import EncryptionVisualizer from "@/components/EncryptionVisualizer";
import { NEGOTIATION_TYPES, saveRoom, getRoom, type NegotiationType, type PriceUnit } from "@/lib/concord";
import { encryptPrice, initFHE, type FHEStatus, type EncryptProgress } from "@/lib/fhe";
// On-chain invites — no external messaging service needed
import { BLIND_NEGOTIATION_ABI, BLIND_NEGOTIATION_ADDRESS, generateRoomIdBytes32, roomIdToCode, getExplorerTxUrl } from "@/lib/contracts";

// Display code is now derived from roomIdHex via roomIdToCode()

const LABEL_STYLE = {
  fontSize: 10, fontWeight: 700, color: "hsl(var(--foreground))", opacity: 0.75,
  textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12,
  display: "flex", alignItems: "center", gap: 8
};

const NEW_BADGE = (
  <span style={{
    fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4,
    background: "rgba(255,214,10,0.12)", color: "#ffd60a",
    border: "1px solid rgba(255,214,10,0.2)", letterSpacing: "0.05em"
  }}>NEW</span>
);

export default function CreateRoom() {
  const [, navigate] = useLocation();

  // Real wallet via wagmi + ConnectKit
  const { address: wagmiAddress, isConnected: walletConnected } = useAccount();
  useDisconnect();
  const walletAddr = wagmiAddress ?? "";
  const { setOpen: openWalletModal } = useModal();

  // Core
  const [type, setType] = useState<NegotiationType>("ma");
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("M"); // M/K/B/USD
  const [encStatus, setEncStatus] = useState<"idle" | "encrypting" | "done">("idle");
  const [fheStatus, setFHEStatus] = useState<FHEStatus>("idle");
  const [ciphertext, setCiphertext] = useState("");
  const [roomId, setRoomId] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 2 invite
  const [recipientInput, setRecipientInput] = useState("");
  const [xmtpState, setXmtpState] = useState<"idle" | "sending" | "sent">("idle");
  const [codeCopied, setCodeCopied] = useState(false);

  // Deal context
  const [dealName, setDealName] = useState("");
  const [dealDesc, setDealDesc] = useState("");
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);

  // Deadline
  const [deadline, setDeadline] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  // Identity
  const [displayName, setDisplayName] = useState("");

  // Notification — counterparty wallet address for on-chain encrypted invite
  const [notifyXmtpAddr, setNotifyXmtpAddr] = useState("");

  const meta = NEGOTIATION_TYPES[type];
  const parsedPrice = parseFloat(price);
  const isValid = !isNaN(parsedPrice) && parsedPrice > 0;
  const roomCode = roomId ? roomIdToCode(roomId as `0x${string}`) : "";

  const toggleTerm = (t: string) => {
    setSelectedTerms(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  // Wagmi hooks for contract interaction
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [txHash, setTxHash] = useState<string>("");
  const [encryptStep, setEncryptStep] = useState<string>("");

  // ── Restore floor-lock state when navigating back from DepositPage ──
  // Saves/restores ALL deal fields so the floor-lock card is fully populated.
  React.useEffect(() => {
    const lastRoomId = localStorage.getItem("concord_last_room");
    if (!lastRoomId || encStatus !== "idle") return;
    const savedRoom = getRoom(lastRoomId);
    if (!savedRoom) return;
    setRoomId(lastRoomId);
    if (savedRoom.myPrice)       setPrice(String(savedRoom.myPrice));
    if (savedRoom.myPriceUnit)   setPriceUnit(savedRoom.myPriceUnit as PriceUnit);
    if (savedRoom.type)          setType(savedRoom.type as NegotiationType);
    if (savedRoom.dealName)      setDealName(savedRoom.dealName);
    if (savedRoom.dealDesc)      setDealDesc(savedRoom.dealDesc);
    if (savedRoom.selectedTerms) setSelectedTerms(savedRoom.selectedTerms);
    if (savedRoom.deadlineStr)   setDeadline(savedRoom.deadlineStr);
    if (savedRoom.displayName)   setDisplayName(savedRoom.displayName);
    if (savedRoom.notifyAddr)    setNotifyXmtpAddr(savedRoom.notifyAddr);
    if (savedRoom.txHash)        setTxHash(savedRoom.txHash);
    setEncStatus("done");
  }, []);

  // ── Eagerly connect FHE client when wallet connects ─────────────
  // connect() is lightweight (~100ms) — just registers chain + wallet.
  // TFHE WASM + keys lazy-load on first encryptInputs call.
  React.useEffect(() => {
    if (!walletConnected || !publicClient || !walletClient) return;

    (async () => {
      try {
        await initFHE(publicClient, walletClient);
      } catch (err) {
        console.warn("[FHE] Pre-connect failed (will retry on encrypt):", err);
      }
    })();
  }, [walletConnected, publicClient, walletClient]);

  // Friendly labels for each encryption step
  const stepLabels: Record<string, string> = {
    InitTfhe: "Loading encryption engine…",
    FetchKeys: "Fetching FHE keys…",
    Pack: "Packing value…",
    Prove: "Generating ZK proof…",
    Verify: "Verifying with CoFHE…",
  };

  const handleCreate = async () => {
    if (!isValid || !walletConnected) {
      console.warn("[CreateRoom] Missing price or wallet connection");
      return;
    }
    if (!publicClient || !walletClient) {
      alert("Wallet is still initializing. Please wait a moment and try again.");
      return;
    }
    setEncStatus("encrypting");
    setFHEStatus("encrypting");
    setEncryptStep("Connecting…");

    try {
      // connect() is fast — no-op if already connected
      await initFHE(publicClient, walletClient);

      // Encrypt with detailed step tracking
      setEncryptStep("Starting encryption…");
      const encrypted = await encryptPrice(BigInt(Math.round(parsedPrice)), (progress) => {
        if (progress.isStart) {
          setEncryptStep(stepLabels[progress.step] || progress.step);
        }
      });
      setCiphertext(JSON.stringify(encrypted.encryptedInput, (_, v) => typeof v === "bigint" ? v.toString() : v).slice(0, 80));
      setFHEStatus("encrypted");

      // 4. Generate on-chain room ID (single source of truth)
      const roomIdHex = generateRoomIdBytes32();
      setRoomId(roomIdHex);

      // 5. Compute deadline timestamp
      const deadlineTs = deadline
        ? BigInt(Math.floor(new Date(deadline).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600); // Default: 7 days

      // 6. Map negotiation type to uint8
      const typeMap: Record<NegotiationType, number> = { ma: 0, salary: 1, realestate: 2, custom: 3 };

      // 7. Send on-chain transaction — use walletClient directly (viem) instead of
      //    wagmi's writeContractAsync which can go stale after the ~2min encryption.
      setEncryptStep("Sending transaction…");
      const hash = await walletClient.writeContract({
        address: BLIND_NEGOTIATION_ADDRESS,
        abi: BLIND_NEGOTIATION_ABI,
        functionName: "createRoom",
        args: [roomIdHex, encrypted.encryptedInput, typeMap[type], deadlineTs],
        chain: walletClient.chain,
        account: walletClient.account,
      });
      setTxHash(hash);

      if (notifyXmtpAddr.trim()) setRecipientInput(notifyXmtpAddr.trim());

      // 8. Save room locally for UI state (keyed by roomIdHex)
      saveRoom({
        id: roomIdHex,
        roomIdHex,
        type,
        label: meta.label,
        status: "pending_b",
        myPrice: Number(price),
        myPriceUnit: priceUnit,
        dealName: dealName || undefined,
        dealDesc: dealDesc || undefined,
        selectedTerms: selectedTerms.length > 0 ? selectedTerms : undefined,
        deadlineStr: deadline || undefined,
        displayName: displayName || undefined,
        notifyAddr: notifyXmtpAddr.trim() || undefined,
        partyA: { address: walletAddr, timestamp: Date.now() },
        createdAt: Date.now(),
        deadline: Number(deadlineTs) * 1000,
        txHash: hash,
      });
      // Persist last completed room so we can restore floor-lock UI on return
      localStorage.setItem("concord_last_room", roomIdHex);
      setEncStatus("done");
    } catch (error: any) {
      console.error("[CreateRoom] Error:", error);
      // Show user-friendly error for common failures
      if (error?.message?.includes("ProviderNotFound") || error?.message?.includes("Provider not found")) {
        alert("Wallet connection was lost during encryption. Please reconnect your wallet and try again.");
      } else if (error?.message?.includes("User rejected") || error?.message?.includes("user rejected")) {
        // User cancelled the tx in their wallet — just reset silently
      } else if (error?.message?.includes("ZK_VERIFY_FAILED")) {
        alert("FHE proof verification failed. This may be a temporary network issue. Please try again.");
      }
      setFHEStatus("idle");
      setEncStatus("idle");
      setEncryptStep("");
    }
  };

  const sendInviteOnChain = async () => {
    if (!recipientInput.trim() || xmtpState !== "idle") return;
    if (!recipientInput.trim().startsWith("0x") || recipientInput.trim().length !== 42) {
      alert("Please enter a valid wallet address (0x...)");
      return;
    }
    setXmtpState("sending");
    try {
      // roomId is already the roomIdHex (bytes32) — use it directly
      if (!roomId || !roomId.startsWith("0x")) throw new Error("Room ID not available");
      if (!walletClient) throw new Error("Wallet not connected");

      await walletClient.writeContract({
        address: BLIND_NEGOTIATION_ADDRESS,
        abi: BLIND_NEGOTIATION_ABI,
        functionName: "sendInvite",
        args: [roomId as `0x${string}`, recipientInput.trim() as `0x${string}`],
        chain: walletClient.chain,
        account: walletClient.account,
      });
      setXmtpState("sent");
    } catch (err) {
      console.error("[SendInvite] Error:", err);
      setXmtpState("idle");
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomId); // Copy full roomIdHex for JoinRoom
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  };

  const handleReset = () => {
    setEncStatus("idle");
    setPrice("");
    setPriceUnit("M");
    setCiphertext("");
    setFHEStatus("idle");
    setRoomId("");
    setRecipientInput("");
    setXmtpState("idle");
    setCodeCopied(false);
    setDealName("");
    setDealDesc("");
    setSelectedTerms([]);
    setDeadline("");
    setDisplayName("");
    setNotifyXmtpAddr("");
    localStorage.removeItem("concord_last_room"); // Clear so DepositPage skip goes to blank form
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />


      <AnimatePresence mode="wait">

        {/* ── STEP 1: premium 2-column layout ─────── */}
        {encStatus !== "done" && (
          <motion.div
            key="form-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
            style={{ minHeight: "calc(100vh - 56px)", paddingTop: 56 }}
          >
            {/* Ambient background glows */}
            <div style={{ position: "fixed", top: "-20%", left: "-10%", width: "50%", height: "50%", borderRadius: "50%", background: "rgba(30,58,138,0.15)", filter: "blur(150px)", pointerEvents: "none" }} />
            <div style={{ position: "fixed", bottom: "-20%", right: "-10%", width: "50%", height: "50%", borderRadius: "50%", background: "rgba(22,78,99,0.08)", filter: "blur(150px)", pointerEvents: "none" }} />
            <div style={{ position: "fixed", top: "20%", right: "10%", width: "30%", height: "30%", borderRadius: "50%", background: "rgba(88,28,135,0.06)", filter: "blur(120px)", pointerEvents: "none" }} />

            <div style={{ position: "relative", zIndex: 10, maxWidth: 1280, margin: "0 auto", padding: "48px 16px 40px" }}>
              {/* Page title row */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40, flexWrap: "wrap" }}>
                <h1 className="sf-display" style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 800, color: "hsl(var(--foreground))", margin: 0, letterSpacing: "-0.02em" }}>Start a negotiation</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(10,132,255,0.08)", border: "1px solid rgba(10,132,255,0.2)", padding: "5px 14px", borderRadius: 50, fontSize: 12, fontWeight: 500, color: "#5ac8fa" }}>
                  <Lock style={{ width: 13, height: 13 }} />
                  End-to-end encrypted
                </div>
              </div>

              <div className="concord-create-main-grid">

                {/* ═══ LEFT COLUMN: Deal Setup ═══ */}
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                  {/* Card 1: Negotiation Type + FHE Viz */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 }}
                    style={{
                      background: "hsl(var(--card))", backdropFilter: "blur(20px)",
                      border: "1px solid #0a84ff", borderRadius: 20,
                      padding: 32, position: "relative", overflow: "hidden",
                    }}
                  >
                    {/* Top hover accent line */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, hsl(var(--muted-foreground)), transparent)" }} />

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                      <Activity style={{ width: 14, height: 14, color: "hsl(var(--muted-foreground))" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.12em" }}>Negotiation Type</span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
                      {(Object.keys(NEGOTIATION_TYPES) as NegotiationType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => { setType(t); setSelectedTerms([]); }}
                          style={{
                            padding: "10px 20px", borderRadius: 14, fontSize: 13, fontWeight: 500,
                            transition: "all 0.25s", cursor: "pointer",
                            background: type === t ? "rgba(59,130,246,0.15)" : "hsl(var(--input))",
                            color: type === t ? "#5ac8fa" : "hsl(var(--muted-foreground))",
                            border: type === t ? "1px solid rgba(59,130,246,0.4)" : "1px solid hsl(var(--border))",
                            boxShadow: type === t ? "0 0 15px rgba(59,130,246,0.1)" : "none",
                          }}
                        >
                          {NEGOTIATION_TYPES[t].label}
                        </button>
                      ))}
                    </div>


                  </motion.div>
                  {/* Card 2: Deal Context */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    style={{
                      background: "hsl(var(--card))", backdropFilter: "blur(20px)",
                      border: "1px solid #0a84ff", borderRadius: 20, padding: 32,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                      <FileText style={{ width: 14, height: 14, color: "hsl(var(--muted-foreground))" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.12em" }}>Deal Context</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", opacity: 0.7, marginBottom: 8 }}>Deal name / title</label>
                        <input
                          type="text"
                          value={dealName}
                          onChange={e => setDealName(e.target.value)}
                          placeholder={meta.titlePlaceholder}
                          style={{
                            width: "100%", background: "hsl(var(--input))", border: "1px solid hsl(var(--))",
                            borderRadius: 14, padding: "12px 16px", fontSize: 14, color: "hsl(var(--foreground))", boxSizing: "border-box",
                            outline: "none", transition: "all 0.2s",
                          }}
                          className="apple-input"
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", opacity: 0.7, marginBottom: 8 }}>Asset or role description</label>
                        <textarea
                          value={dealDesc}
                          onChange={e => setDealDesc(e.target.value.slice(0, 140))}
                          placeholder={meta.descPlaceholder}
                          rows={3}
                          style={{
                            width: "100%", background: "hsl(var(--input))", border: "1px solid hsl(var(--))",
                            borderRadius: 14, padding: "12px 16px", fontSize: 14, color: "hsl(var(--foreground))", boxSizing: "border-box",
                            outline: "none", resize: "none", lineHeight: 1.6, transition: "all 0.2s",
                          }}
                          className="apple-input"
                        />
                        <div style={{ textAlign: "right", marginTop: 4, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{dealDesc.length} / 140</div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", opacity: 0.7, marginBottom: 10 }}>Deal terms / conditions</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {meta.terms.map(term => {
                            const active = selectedTerms.includes(term);
                            return (
                              <button
                                key={term}
                                onClick={() => toggleTerm(term)}
                                style={{
                                  padding: "8px 16px", borderRadius: 14, fontSize: 13, fontWeight: 500,
                                  cursor: "pointer", transition: "all 0.2s",
                                  background: active ? "hsl(var(--primary))" : "hsl(var(--secondary))",
                                  border: "1px solid hsl(var(--border))",
                                  color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                                }}
                              >
                                {term}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", opacity: 0.7, marginBottom: 8 }}>Offer expires</label>
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ flex: 1, position: "relative" }}>
                            <Calendar style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "hsl(var(--muted-foreground))", pointerEvents: "none" }} />
                            <input
                              type="date"
                              value={deadline}
                              onChange={e => setDeadline(e.target.value)}
                              className="apple-input"
                              style={{
                                width: "100%", padding: "12px 14px 12px 36px", borderRadius: 12, fontSize: 13, fontWeight: 500,
                                background: "hsl(var(--input))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))",
                                outline: "none", transition: "all 0.2s"
                              }}
                            />
                          </div>
                          <select
                            value={timezone}
                            onChange={e => setTimezone(e.target.value)}
                            style={{
                              background: "hsl(var(--input))", border: "1px solid hsl(var(--))",
                              borderRadius: 14, padding: "12px 16px", fontSize: 14, color: "hsl(var(--foreground))",
                              minWidth: 100, outline: "none",
                            }}
                            className="apple-input"
                          >
                            {["UTC", "ET", "PT", "CT", "MT", "CET", "JST", "AEST"].map(tz => (
                              <option key={tz} value={tz}>{tz}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* ═══ RIGHT COLUMN: Execution ═══ */}
                <div>
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    style={{
                      position: "relative", borderRadius: 20, padding: 1, overflow: "hidden",
                      background: "#0a84ff"
                    }}
                  >
                    {/* Subtle gradient border glow */}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(34,211,238,0.12), transparent 50%, rgba(59,130,246,0.12))", opacity: 0.3, pointerEvents: "none" }} />

                    <div style={{ position: "relative", background: "hsl(var(--card))", borderRadius: 19, padding: 28 }}>

                      {/* Identity section */}
                      <div style={{ marginBottom: 28 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.12em", display: "flex", alignItems: "center", gap: 8 }}>
                            <Fingerprint style={{ width: 14, height: 14 }} />
                            Your Identity
                          </span>
                          {walletConnected && (
                            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#22d3ee", background: "rgba(34,211,238,0.08)", padding: "3px 10px", borderRadius: 50 }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22d3ee" }} />
                              Verified
                            </span>
                          )}
                        </div>

                        {!walletConnected ? (
                          <button
                            onClick={() => openWalletModal(true)}
                            style={{
                              width: "100%", padding: "12px 16px", borderRadius: 14, fontSize: 14, fontWeight: 500,
                              background: "hsl(var(--input))", border: "1px solid hsl(var(--border))",
                              color: "hsl(var(--foreground))", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                              transition: "all 0.2s", marginBottom: 12,
                            }}
                            className="btn-ghost"
                          >
                            <Wallet style={{ width: 16, height: 16 }} />
                            Connect Wallet
                          </button>
                        ) : (
                          <div
                            onClick={() => openWalletModal(true)}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "10px 14px", borderRadius: 14, background: "hsl(var(--input))",
                              border: "1px solid hsl(var(--))", cursor: "pointer", marginBottom: 12,
                              transition: "all 0.2s",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{
                                width: 32, height: 32, borderRadius: "50%",
                                background: "linear-gradient(135deg, #10b981, #14b8a6)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 700, color: "hsl(var(--foreground))",
                              }}>
                                {walletAddr.slice(2, 4).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontFamily: "monospace", color: "hsl(var(--foreground))", display: "flex", alignItems: "center", gap: 6 }}>
                                  {walletAddr.slice(0, 6)}...{walletAddr.slice(-4)}
                                  <CheckCircle2 style={{ width: 12, height: 12, color: "#10b981" }} />
                                </div>
                                <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                                  {meta.label}
                                </div>
                              </div>
                            </div>
                            <ChevronDown style={{ width: 14, height: 14, color: "hsl(var(--muted-foreground))" }} />
                          </div>
                        )}

                        <input
                          type="text"
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          placeholder="Display name (optional, off-chain)"
                          style={{
                            width: "100%", background: "transparent", border: "none",
                            borderBottom: "1px solid hsl(var(--border))", padding: "8px 0",
                            fontSize: 13, color: "hsl(var(--foreground))", boxSizing: "border-box", outline: "none",
                            transition: "all 0.2s",
                          }}
                        />
                      </div>

                      {/* Price input — hero with glow */}
                      <div style={{ marginBottom: 28, position: "relative" }}>
                        {/* Ambient glow behind price */}
                        <div style={{ position: "absolute", inset: -16, background: "rgba(34,211,238,0.03)", filter: "blur(20px)", borderRadius: "50%", pointerEvents: "none" }} />

                        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", opacity: 0.7, marginBottom: 8, position: "relative" }}>
                          {meta.partyALabel}
                        </label>
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                          <span style={{ position: "absolute", left: 16, fontSize: 24, color: "hsl(var(--muted-foreground))", zIndex: 2 }}>$</span>
                          <input
                            type="number"
                            value={price}
                            onChange={e => setPrice(e.target.value)}
                            placeholder={meta.placeholder}
                            style={{
                              width: "100%", background: "hsl(var(--input))", border: "1px solid hsl(var(--border))",
                              borderRadius: 14, padding: "16px 110px 16px 40px", fontSize: 28, fontWeight: 300,
                              color: "hsl(var(--foreground))", boxSizing: "border-box", outline: "none",
                              transition: "all 0.3s",
                              boxShadow: price ? "0 0 20px rgba(34,211,238,0.08)" : "none",
                            }}
                            className="apple-input"
                            onKeyDown={e => e.key === "Enter" && isValid && walletConnected && setShowConfirm(true)}
                          />
                          {/* Unit Selector — click to cycle M → K → B → USD → M */}
                          <button
                            type="button"
                            onClick={() => {
                              const order: PriceUnit[] = ["M", "K", "B", "USD"];
                              const idx = order.indexOf(priceUnit);
                              setPriceUnit(order[(idx + 1) % order.length]);
                            }}
                            title="Click to change unit"
                            style={{
                              position: "absolute", right: 8, display: "flex", alignItems: "center", gap: 4,
                              background: "hsl(var(--secondary))", borderRadius: 10, padding: "6px 10px",
                              border: "1px solid hsl(var(--border))", cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#0a84ff" }}>{priceUnit}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", marginLeft: 1 }}>USD</span>
                            <ChevronDown style={{ width: 10, height: 10, color: "hsl(var(--muted-foreground))" }} />
                          </button>
                        </div>
                        {/* Unit hint */}
                        <div style={{ marginTop: 6, fontSize: 11, color: "hsl(var(--muted-foreground))", opacity: 0.7 }}>
                          {price && !isNaN(parseFloat(price)) && (
                            <>
                              {priceUnit === "M" && `= $${parseFloat(price).toLocaleString()} million USD`}
                              {priceUnit === "K" && `= $${parseFloat(price).toLocaleString()} thousand USD`}
                              {priceUnit === "B" && `= $${parseFloat(price).toLocaleString()} billion USD`}
                              {priceUnit === "USD" && `= $${parseFloat(price).toLocaleString()} USD (exact)`}
                              {" "}· tap the badge to change unit
                            </>
                          )}
                          {!price && "Enter your price — tap the badge to change unit (M/K/B/USD)"}
                        </div>

                        {/* Ciphertext preview */}
                        <div style={{ marginTop: 14, background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))", borderRadius: 12, padding: 12, position: "relative", overflow: "hidden" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "flex", alignItems: "center", gap: 6 }}>
                              <Lock style={{ width: 11, height: 11 }} />
                              On-chain ciphertext
                            </span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#0a84ff", background: "rgba(10,132,255,0.12)", border: "1px solid rgba(10,132,255,0.2)", padding: "2px 8px", borderRadius: 4 }}>FHE-256</span>
                          </div>
                          <EncryptionVisualizer
                            isEncrypting={fheStatus === "encrypting"}
                            isEncrypted={fheStatus === "encrypted"}
                            ciphertextHex={ciphertext}
                            label=""
                          />
                        </div>
                      </div>

                      {/* Invite section */}
                      <div style={{ marginBottom: 28, paddingTop: 24, borderTop: "1px solid hsl(var(--border))" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                          <User style={{ width: 14, height: 14, color: "hsl(var(--muted-foreground))" }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.12em" }}>Notify Counterparty</span>
                        </div>

                        <div style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 16, padding: 16 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                            <div style={{ marginTop: 2, width: 24, height: 24, borderRadius: "50%", background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Lock style={{ width: 11, height: 11, color: "#5ac8fa" }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))" }}>Encrypted Invite Room</div>
                              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Stored on Base Sepolia</div>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={notifyXmtpAddr}
                            onChange={e => setNotifyXmtpAddr(e.target.value)}
                            placeholder="Counterparty wallet address (0x...)"
                            style={{
                              width: "100%", background: "hsl(var(--input))", border: "1px solid hsl(var(--border))",
                              borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "hsl(var(--foreground))", fontFamily: "monospace",
                              boxSizing: "border-box", outline: "none", marginBottom: 8, transition: "all 0.2s",
                            }}
                            className="apple-input"
                          />
                          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, margin: 0 }}>
                            Room code is encrypted for the counterparty's public key. They decrypt it via Concord Inbox.
                          </p>
                        </div>
                      </div>

                      {/* CTA button with gradient glow */}
                      <div style={{ position: "relative" }}>
                        {/* Glow behind button */}
                        <div style={{
                          position: "absolute", inset: -4,
                          background: "linear-gradient(90deg, #22d3ee, #3b82f6)",
                          borderRadius: 16, filter: "blur(12px)", opacity: (!isValid || !walletConnected || !publicClient || !walletClient) ? 0 : 0.2,
                          transition: "opacity 0.5s", pointerEvents: "none",
                        }} />
                        <button
                          onClick={() => setShowConfirm(true)}
                          disabled={!isValid || !walletConnected || !publicClient || !walletClient || encStatus === "encrypting"}
                          style={{
                            position: "relative", width: "100%", padding: "16px 24px",
                            borderRadius: 14, fontSize: 15, fontWeight: 700,
                            background: (!isValid || !walletConnected || !publicClient || !walletClient) ? "hsl(var(--secondary))" : "hsl(var(--primary))",
                            color: (!isValid || !walletConnected || !publicClient || !walletClient) ? "hsl(var(--muted-foreground))" : "hsl(var(--primary-foreground))", border: "1px solid hsl(var(--border))",
                            cursor: (!isValid || !walletConnected || !publicClient || !walletClient || encStatus === "encrypting") ? "not-allowed" : "pointer",
                            opacity: (!isValid || !walletConnected || !publicClient || !walletClient) ? 0.7 : 1,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            transition: "all 0.3s",
                          }}
                        >
                          {encStatus === "encrypting" ? (
                            <><div style={{ width: 16, height: 16, border: "2px solid hsl(var(--muted-foreground))", borderTop: "2px solid white", borderRadius: "50%" }} className="animate-spin" />{encryptStep || "Encrypting..."}</>
                          ) : !walletConnected ? (
                            <><Wallet style={{ width: 15, height: 15 }} />Connect Wallet to Continue</>
                          ) : (!publicClient || !walletClient) ? (
                            <><div style={{ width: 15, height: 15, border: "2px solid hsl(var(--muted-foreground))", borderTop: "2px solid white", borderRadius: "50%" }} className="animate-spin" />Initializing Wallet…</>
                          ) : (
                            <><Lock style={{ width: 15, height: 15 }} />Review and Encrypt Room</>
                          )}
                        </button>
                      </div>
                      <p style={{ textAlign: "center", fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 14, padding: "0 16px" }}>
                        Values are encrypted locally on this device before transmission. Concord never sees plaintext.
                      </p>

                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        )}


        {/* ── STEP 2: floor locked ─────────────────────────────────────────── */}
        {encStatus === "done" && (
          <motion.div
            key="done-wrap"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.32, 0, 0, 1] }}
            style={{ paddingTop: "88px", paddingBottom: "40px", paddingLeft: "clamp(16px, 4vw, 32px)", paddingRight: "clamp(16px, 4vw, 32px)", maxWidth: "960px", margin: "0 auto" }}
          >
            <div className="apple-card" style={{ padding: "28px", borderColor: "#0a84ff" }}>

              {/* ── CARD HEADER ─────────────────────────────────────── */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(48,209,88,0.1)", border: "1px solid rgba(48,209,88,0.3)" }}
                  >
                    <ShieldCheck style={{ width: 18, height: 18, color: "#30d158" }} strokeWidth={1.75} />
                  </motion.div>
                  <div>
                    <h2 className="sf-display" style={{ fontSize: 20, color: "hsl(var(--foreground))", lineHeight: 1.2, margin: 0 }}>Floor locked</h2>
                    <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>Your floor price is securely encrypted on-chain. Invite your counterparty to begin.</p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "hsl(var(--muted-foreground))", marginBottom: 24 }} />

              {/* ── TWO COLUMNS ─────────────────────────────────────── */}
              <div className="concord-create-grid">

                {/* LEFT: deal summary from step 1 */}
                <div>
                  <div style={LABEL_STYLE}>Deal Summary</div>

                  {/* Type + name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "rgba(10,132,255,0.12)", border: "1px solid rgba(10,132,255,0.25)", color: "#0a84ff" }}>{meta.label}</span>
                    {dealName && <span style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>{dealName}</span>}
                  </div>

                  {/* Description */}
                  {dealDesc && (
                    <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.6, marginBottom: 12 }}>{dealDesc}</p>
                  )}

                  {/* Selected terms */}
                  {selectedTerms.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                      {selectedTerms.map(t => (
                        <span key={t} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.2)", color: "#0a84ff" }}>{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Deadline */}
                  {deadline && (
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                      <Calendar style={{ width: 12, height: 12, color: "hsl(var(--muted-foreground))" }} />
                      <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Expires {deadline} {timezone}</span>
                    </div>
                  )}

                  <div style={{ height: 1, background: "hsl(var(--muted-foreground))", margin: "14px 0" }} />

                  {/* Initiator identity */}
                  <div style={LABEL_STYLE}>Initiator</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "rgba(48,209,88,0.05)", border: "1px solid rgba(48,209,88,0.12)" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(10,132,255,0.15)", border: "1px solid rgba(10,132,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#0a84ff" }}>{walletAddr.slice(2, 4).toUpperCase()}</span>
                    </div>
                    <div>
                      {displayName && <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>{displayName}</div>}
                      <div className="font-mono" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{walletAddr.slice(0, 8)}…{walletAddr.slice(-4)}</div>
                    </div>
                  </div>

                  {/* Notification method */}
                  <div style={{ marginTop: 14, fontSize: 11, color: "hsl(var(--muted-foreground))", display: "flex", alignItems: "center", gap: 6 }}>
                    <Bell style={{ width: 11, height: 11 }} />
                    {notifyXmtpAddr ? `On-Chain invite → ${notifyXmtpAddr.slice(0, 10)}…` : "No counterparty address — share code manually"}
                  </div>
                </div>

                {/* Vertical divider */}
                <div className="concord-create-divider" />

                {/* RIGHT: encrypted floor + invite + actions */}
                <div>
                  {/* Encrypted floor confirmation */}
                  <div style={LABEL_STYLE}>
                    Floor Price
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(48,209,88,0.12)", color: "#30d158", border: "1px solid rgba(48,209,88,0.22)", marginLeft: "auto" }}>Encrypted</span>
                  </div>
                  <div style={{ padding: "14px", borderRadius: 12, background: "rgba(48,209,88,0.04)", border: "1px solid rgba(48,209,88,0.14)", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                    <Lock style={{ width: 16, height: 16, color: "#30d158", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#30d158" }}>Floor price securely encrypted</div>
                      <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>Stored on-chain as FHE ciphertext — invisible to everyone</div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: "hsl(var(--muted-foreground))", marginBottom: 20 }} />

                  {/* Invite counterparty */}
                  <div style={LABEL_STYLE}>Invite Counterparty On-Chain</div>
                  {xmtpState !== "sent" ? (
                    <>
                      <input
                        type="text"
                        value={recipientInput}
                        onChange={e => setRecipientInput(e.target.value)}
                        readOnly={!!notifyXmtpAddr.trim()}
                        placeholder="0x… or ENS name"
                        className="apple-input"
                        style={{ width: "100%", padding: "11px 14px", fontSize: 13, fontFamily: "monospace", marginBottom: 10, boxSizing: "border-box", opacity: notifyXmtpAddr.trim() ? 0.55 : 1, cursor: notifyXmtpAddr.trim() ? "not-allowed" : "text" }}
                      />
                      <button
                        onClick={sendInviteOnChain}
                        disabled={!recipientInput.trim() || xmtpState === "sending"}
                        className="btn-apple"
                        style={{ width: "100%", padding: "12px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: !recipientInput.trim() ? 0.35 : 1, cursor: !recipientInput.trim() || xmtpState === "sending" ? "not-allowed" : "pointer" }}
                      >
                        {xmtpState === "sending" ? (
                          <><div style={{ width: 14, height: 14, border: "2px solid hsl(var(--muted-foreground))", borderTop: "2px solid white", borderRadius: "50%" }} className="animate-spin" />Sending…</>
                        ) : (
                          <><Send style={{ width: 13, height: 13 }} />Send On-Chain Invite</>
                        )}
                      </button>
                    </>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "rgba(48,209,88,0.07)", border: "1px solid rgba(48,209,88,0.2)" }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(48,209,88,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Check style={{ width: 13, height: 13, color: "#30d158" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#30d158" }}>Invite sent on-chain ✓</div>
                        <div className="font-mono" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                          {recipientInput.length > 22 ? `${recipientInput.slice(0, 10)}…${recipientInput.slice(-6)}` : recipientInput}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div style={{ height: 1, background: "hsl(var(--muted-foreground))", margin: "20px 0" }} />


                  {/* Wave 4: Escrow toggle */}
                  <div style={{ padding: "14px", borderRadius: 12, background: "rgba(10,132,255,0.04)", border: "1px solid rgba(10,132,255,0.14)", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Lock style={{ width: 13, height: 13, color: "#0a84ff" }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>Confidential Escrow</span>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: "rgba(10,132,255,0.12)", color: "#0a84ff", border: "1px solid rgba(10,132,255,0.25)", letterSpacing: "0.05em" }}>WAVE 4</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, marginBottom: 10 }}>
                      Lock funds on-chain before the deal. On a match, payment is sent automatically — no bank, no broker.
                    </p>
                    <button
                      onClick={() => navigate(`/deposit/${roomId}`)}
                      style={{ width: "100%", padding: "9px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, background: "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.22)", color: "#0a84ff", cursor: "pointer" }}
                    >
                      <Lock style={{ width: 12, height: 12 }} /> Set Up Escrow <ArrowRight style={{ width: 12, height: 12 }} />
                    </button>
                  </div>

                  {/* Actions */}
                  <button onClick={() => navigate(`/room/${roomId}`)} className="btn-apple" style={{ width: "100%", padding: "13px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
                    Open Room <ArrowRight style={{ width: 15, height: 15 }} />
                  </button>
                  <button onClick={handleReset} className="btn-ghost" style={{ width: "100%", padding: "12px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    New Negotiation
                  </button>

                </div>

              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

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

            {/* Centering wrapper — not animated, just positions the modal */}
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
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(10,132,255,0.12)", border: "1px solid rgba(10,132,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ShieldCheck style={{ width: 18, height: 18, color: "#0a84ff" }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "hsl(var(--foreground))", margin: 0, lineHeight: 1.2 }}>Confirm your details</h2>
                  <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>Review everything before encrypting your floor price</p>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "hsl(var(--muted-foreground))", marginBottom: 20 }} />

              {/* Summary rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>

                {/* Type */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Negotiation Type</span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: "rgba(10,132,255,0.12)", border: "1px solid rgba(10,132,255,0.25)", color: "#0a84ff" }}>{meta.label}</span>
                </div>

                {/* Deal name */}
                {dealName && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Deal Name</span>
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
                        <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.2)", color: "#0a84ff" }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Deadline */}
                {deadline && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Deadline</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>{deadline} {timezone}</span>
                  </div>
                )}

                {/* Initiator identity */}
                {displayName && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Your Identity</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>{displayName}</span>
                  </div>
                )}

                {/* Wallet */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Wallet</span>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "hsl(var(--foreground))", opacity: 0.7 }}>{walletAddr.slice(0,8)}…{walletAddr.slice(-4)}</span>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: "hsl(var(--muted-foreground))" }} />

                {/* Floor price */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 12, background: "rgba(10,132,255,0.06)", border: "1px solid rgba(10,132,255,0.18)" }}>
                  <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Floor Price (will be encrypted)</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "hsl(var(--foreground))", fontFamily: "monospace" }}>${price} <span style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>USD</span></span>
                </div>

                {/* Counterparty address */}
                {notifyXmtpAddr && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Counterparty Wallet</span>
                    <span style={{ fontSize: 12, fontFamily: "monospace", color: "hsl(var(--foreground))", opacity: 0.7 }}>{notifyXmtpAddr.slice(0,10)}…{notifyXmtpAddr.slice(-4)}</span>
                  </div>
                )}

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
                  onClick={() => { setShowConfirm(false); handleCreate(); }}
                  className="btn-apple"
                  style={{ flex: 2, padding: "13px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  <Lock style={{ width: 15, height: 15 }} />
                  Confirm &amp; Encrypt Room
                </button>
              </div>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}




