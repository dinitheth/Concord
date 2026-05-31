import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Zap, CheckCircle2, XCircle, ArrowRight, ShieldCheck, Play, RotateCcw } from "lucide-react";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";
import { NEGOTIATION_TYPES, type NegotiationType, formatPrice } from "@/lib/concord";

// Self-contained demo helpers — NOT the real FHE flow.
// The real flow uses @cofhe/sdk in CreateRoom/RoomPage.
async function demoEncrypt(value: number): Promise<{ ciphertextHex: string }> {
  await new Promise(r => setTimeout(r, 200));
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return { ciphertextHex: "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("") };
}
async function demoFHECompute(floorPrice: number, ceilingPrice: number) {
  await new Promise(r => setTimeout(r, 300));
  const matched = ceilingPrice >= floorPrice;
  const agreedPrice = matched ? Math.round(((floorPrice + ceilingPrice) / 2) * 10) / 10 : undefined;
  return { matched, agreedPrice };
}

type PartyState = "idle" | "encrypting" | "ready";
type ComputeState = "idle" | "running" | "done";

const COMPUTE_STEPS = [
  { label: "Load ciphertexts from chain", op: "FHE.asEuint64(partyA), FHE.asEuint64(partyB)" },
  { label: "Compare in encrypted space", op: "ebool hasMatch = FHE.gte(ceiling, floor)" },
  { label: "Compute encrypted sum", op: "euint64 sum = FHE.add(floor, ceiling)" },
  { label: "Compute encrypted midpoint", op: "euint64 mid = FHE.div(sum, 2)" },
  { label: "Conditional result selection", op: "euint64 result = FHE.select(hasMatch, mid, 0)" },
  { label: "Threshold network decrypts", op: "decryptForView(matched) — UI only, no on-chain reveal" },
];

const DEMO_PRESETS: Record<NegotiationType, { a: string; b: string }> = {
  ma: { a: "80", b: "95" },
  salary: { a: "120", b: "140" },
  realestate: { a: "2.1", b: "2.4" },
  custom: { a: "50", b: "65" },
};

async function typeValue(
  value: string,
  setter: (v: string) => void
) {
  for (let i = 1; i <= value.length; i++) {
    setter(value.slice(0, i));
    await new Promise(r => setTimeout(r, 100));
  }
}

export default function NegotiatePage() {
  const [type, setType] = useState<NegotiationType>("ma");
  const [priceA, setPriceA] = useState("");
  const [priceB, setPriceB] = useState("");
  const [stateA, setStateA] = useState<PartyState>("idle");
  const [stateB, setStateB] = useState<PartyState>("idle");
  const [ciphertextA, setCiphertextA] = useState("");
  const [ciphertextB, setCiphertextB] = useState("");
  const [computeState, setComputeState] = useState<ComputeState>("idle");
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [result, setResult] = useState<{ matched: boolean; agreedPrice?: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const abortRef = useRef(false);

  const meta = NEGOTIATION_TYPES[type];

  const reset = () => {
    abortRef.current = true;
    setPlaying(false);
    setPriceA(""); setPriceB("");
    setStateA("idle"); setStateB("idle");
    setCiphertextA(""); setCiphertextB("");
    setComputeState("idle");
    setVisibleSteps(0);
    setResult(null);
  };

  const runDemo = async () => {
    abortRef.current = false;
    setPlaying(true);
    setPriceA(""); setPriceB("");
    setStateA("idle"); setStateB("idle");
    setCiphertextA(""); setCiphertextB("");
    setComputeState("idle");
    setVisibleSteps(0);
    setResult(null);

    const preset = DEMO_PRESETS[type];
    await new Promise(r => setTimeout(r, 300));

    // Type Party A
    await typeValue(preset.a, setPriceA);
    if (abortRef.current) return;
    await new Promise(r => setTimeout(r, 350));

    // Encrypt A
    setStateA("encrypting");
    await new Promise(r => setTimeout(r, 900));
    if (abortRef.current) return;
    const encA = await demoEncrypt(parseFloat(preset.a));
    setCiphertextA(encA.ciphertextHex);
    setStateA("ready");
    await new Promise(r => setTimeout(r, 500));
    if (abortRef.current) return;

    // Type Party B
    await typeValue(preset.b, setPriceB);
    if (abortRef.current) return;
    await new Promise(r => setTimeout(r, 350));

    // Encrypt B
    setStateB("encrypting");
    await new Promise(r => setTimeout(r, 900));
    if (abortRef.current) return;
    const encB = await demoEncrypt(parseFloat(preset.b));
    setCiphertextB(encB.ciphertextHex);
    setStateB("ready");
    await new Promise(r => setTimeout(r, 700));
    if (abortRef.current) return;

    // FHE compute
    setComputeState("running");
    for (let i = 0; i < COMPUTE_STEPS.length; i++) {
      if (abortRef.current) return;
      await new Promise(r => setTimeout(r, 430));
      setVisibleSteps(i + 1);
    }
    if (abortRef.current) return;

    const res = await demoFHECompute(parseFloat(preset.a), parseFloat(preset.b));
    setResult({ matched: res.matched, agreedPrice: res.agreedPrice });
    setComputeState("done");
    setPlaying(false);
  };

  const displayPrice = result?.matched && result.agreedPrice
    ? formatPrice(result.agreedPrice, meta.unit)
    : null;

  const isDone = computeState === "done" || (!playing && priceA === "");

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-20 px-6 max-w-5xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0, 0, 1] }}
          className="pt-10 text-center mb-8"
        >
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <FHEBadge label="Fhenix CoFHE" />
          </div>
          <h1 className="sf-display text-[28px] sm:text-[36px] md:text-[40px] text-foreground mb-2">How it Works</h1>
          <p className="text-[15px] text-foreground/45 max-w-lg mx-auto leading-relaxed">
            Both parties enter their number independently. FHE computes the match in encrypted space. Neither side ever sees the other's price.
          </p>

          <div className="flex items-center justify-center gap-3 mt-6">
            {!playing && (
              <button
                onClick={runDemo}
                className="btn-apple px-6 py-2.5 text-[14px] flex items-center gap-2 glow-blue"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                {result ? "Play Again" : "Watch Demo"}
              </button>
            )}
            {playing && (
              <button
                onClick={reset}
                className="btn-ghost px-5 py-2 text-[13px] flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </motion.div>

        {/* Type tabs */}
        <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
          {(Object.keys(NEGOTIATION_TYPES) as NegotiationType[]).map(t => (
            <button
              key={t}
              disabled={playing}
              onClick={() => { if (!playing) { reset(); setTimeout(() => setType(t), 50); } }}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-150 disabled:cursor-not-allowed ${
                type === t
                  ? "bg-[#0a84ff] text-foreground"
                  : "bg-[rgba(255,255,255,0.06)] text-foreground/50 hover:text-foreground/80 hover:bg-[rgba(255,255,255,0.09)]"
              }`}
            >
              {NEGOTIATION_TYPES[t].label}
            </button>
          ))}
        </div>

        {/* Two party panels — read-only display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <DemoPanel
            role="A"
            label="Party A: Initiator"
            fieldLabel={meta.partyALabel}
            colorAccent="#0a84ff"
            price={priceA}
            partyState={stateA}
            ciphertext={ciphertextA}
            unit={meta.unit}
            note="Only they see this. Never transmitted in plaintext."
          />
          <DemoPanel
            role="B"
            label="Party B: Counterparty"
            fieldLabel={meta.partyBLabel}
            colorAccent="#5ac8fa"
            price={priceB}
            partyState={stateB}
            ciphertext={ciphertextB}
            unit={meta.unit}
            note="Their counterparty cannot see this value."
          />
        </div>

        {/* FHE steps */}
        <AnimatePresence>
          {(computeState === "running" || computeState === "done") && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="apple-card p-6 mb-5"
            >
              <div className="flex items-center gap-2.5 mb-5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  computeState === "done" ? "bg-[rgba(48,209,88,0.12)]" : "bg-[rgba(10,132,255,0.12)]"
                }`}>
                  {computeState === "done"
                    ? <CheckCircle2 className="w-4 h-4 text-[#30d158]" />
                    : <Zap className="w-4 h-4 text-[#0a84ff] gentle-pulse" />
                  }
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground sf-headline">
                    {computeState === "done" ? "Computation Complete" : "Computing in Encrypted Space…"}
                  </h3>
                  <p className="text-[12px] text-foreground/35">Fhenix CoFHE. No value is ever decrypted during computation</p>
                </div>
              </div>
              <div className="space-y-2">
                {COMPUTE_STEPS.map((step, i) => (
                  <AnimatePresence key={i}>
                    {i < visibleSteps && (
                      <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-start gap-3"
                      >
                        <div className={`w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-bold ${
                          i < visibleSteps - 1 || computeState === "done"
                            ? "bg-[rgba(48,209,88,0.12)] text-[#30d158]"
                            : "bg-[rgba(10,132,255,0.12)] text-[#0a84ff]"
                        }`}>
                          {i < visibleSteps - 1 || computeState === "done" ? "✓" : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-foreground/60 mb-0.5">{step.label}</div>
                          <code className="text-[11px] font-mono text-[#0a84ff]/70 break-all">{step.op}</code>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {result && computeState === "done" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18 }}
            >
              <div
                className="apple-card p-8 text-center mb-4"
                style={result.matched
                  ? { background: "linear-gradient(135deg, #0a1f0a 0%, #050f05 100%)", borderColor: "rgba(48,209,88,0.25)" }
                  : { background: "linear-gradient(135deg, #1a0808 0%, #0f0505 100%)", borderColor: "rgba(255,69,58,0.2)" }
                }
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                  className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                  style={result.matched
                    ? { background: "rgba(48,209,88,0.12)", border: "1px solid rgba(48,209,88,0.3)" }
                    : { background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.25)" }
                  }
                >
                  {result.matched
                    ? <CheckCircle2 className="w-8 h-8 text-[#30d158]" strokeWidth={1.75} />
                    : <XCircle className="w-8 h-8 text-[#ff453a]" strokeWidth={1.75} />
                  }
                </motion.div>
                <h2 className="sf-display text-[36px] text-foreground mb-2">
                  {result.matched ? "Deal Found" : "No Overlap"}
                </h2>
                {result.matched && displayPrice ? (
                  <>
                    <p className="text-[14px] text-foreground/40 mb-6">
                      Prices overlapped. FHE computed the midpoint in encrypted space.
                    </p>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                      <div className="text-[13px] font-semibold text-[#30d158]/60 uppercase tracking-widest mb-2">Agreed Price</div>
                      <div className="sf-display text-[72px] leading-none" style={{ color: "#30d158" }}>
                        {displayPrice}
                      </div>
                    </motion.div>
                    <div className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-foreground/25">
                      <Lock className="w-3 h-3" />
                      <span>Neither party's floor or ceiling was revealed at any point</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[15px] text-foreground/45 max-w-sm mx-auto leading-relaxed mt-1">
                    No overlap detected. Zero information leaked. Neither party learned anything about the other's number.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
                {[
                  { label: "Party A's floor", value: "Never revealed", color: "#ff453a" },
                  { label: "Party B's ceiling", value: "Never revealed", color: "#ff453a" },
                  { label: "Computation", value: "Fully encrypted", color: "#30d158" },
                ].map((item, i) => (
                  <div key={i} className="apple-card p-3.5 text-center">
                    <div className="text-[11px] text-foreground/30 mb-1">{item.label}</div>
                    <div className="text-[12px] font-semibold" style={{ color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>


            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Wave 5: Sealed-Bid Auction Explainer ────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-12 pt-10"
          style={{ borderTop: "1px solid hsl(var(--border))" }}
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.2)" }}>
              <span className="text-[11px] font-bold text-[#ff9500] uppercase tracking-wider">New: Wave 5</span>
            </div>
            <h2 className="sf-display text-[24px] sm:text-[30px] text-foreground mb-2">Multi-Party Sealed-Bid Auctions</h2>
            <p className="text-[14px] text-foreground/40 max-w-lg mx-auto leading-relaxed">
              Multiple bidders submit encrypted ceilings against a seller's encrypted floor. An FHE tournament bracket finds the highest qualifying bid — no one sees any number.
            </p>
          </div>

          {/* How the auction works — step by step */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[
              {
                step: "1",
                title: "Seller Creates Auction",
                desc: "Encrypts floor price on-device, sets max bidders (2-10), deadline, and industry-specific metadata.",
                color: "#0a84ff",
              },
              {
                step: "2",
                title: "Bidders Submit Sealed Bids",
                desc: "Each bidder encrypts their ceiling price. On-chain, they're stored as euint64 ciphertext — invisible to everyone.",
                color: "#5ac8fa",
              },
              {
                step: "3",
                title: "FHE Tournament Bracket",
                desc: "The contract runs pairwise FHE.gte() comparisons to find the highest eligible bid and computes the encrypted midpoint.",
                color: "#ff9500",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="apple-card p-5"
                style={{ borderColor: `${item.color}30` }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold mb-3"
                  style={{ background: `${item.color}15`, color: item.color }}
                >
                  {item.step}
                </div>
                <h3 className="text-[14px] font-semibold text-foreground mb-1">{item.title}</h3>
                <p className="text-[12px] text-foreground/35 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* FHE Tournament visual */}
          <div className="apple-card p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-[#ff9500]" />
              <span className="text-[13px] font-semibold text-foreground">FHE Tournament Logic</span>
            </div>
            <div className="font-mono text-[12px] text-foreground/50 space-y-1.5 leading-relaxed">
              <div><span className="text-[#5ac8fa]">for each bid</span> in bidders:</div>
              <div className="pl-4">isEligible = <span className="text-[#ff9500]">FHE.gte</span>(bid.ceiling, seller.floor)</div>
              <div className="pl-4">isBetter = <span className="text-[#ff9500]">FHE.gte</span>(bid, currentBest)</div>
              <div className="pl-4">currentBest = <span className="text-[#ff9500]">FHE.select</span>(isEligible AND isBetter, bid, currentBest)</div>
              <div className="mt-2">agreedPrice = <span className="text-[#30d158]">FHE.div</span>(<span className="text-[#30d158]">FHE.add</span>(floor, bestBid), 2)</div>
              <div className="mt-2 text-foreground/25 text-[11px]">// All operations run on encrypted ciphertexts — zero values are ever decrypted during computation</div>
            </div>
          </div>

          {/* Industry dashboards */}
          <div className="text-center mb-6">
            <h3 className="text-[18px] font-bold text-foreground mb-1">Industry-Specific Dashboards</h3>
            <p className="text-[13px] text-foreground/35">Each deal type carries specialized metadata alongside the encrypted core</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { type: "M&A Deal", fields: "Company, ARR, Employees, Stage", color: "#0a84ff" },
              { type: "Salary", fields: "Role, Department, Location, Model", color: "#30d158" },
              { type: "Real Estate", fields: "Address, Sq Ft, Beds, Year", color: "#ff9500" },
              { type: "Custom", fields: "Flexible — any two-party deal", color: "#a78bfa" },
            ].map((item, i) => (
              <div key={i} className="apple-card p-4 text-center">
                <div className="text-[12px] font-bold mb-1" style={{ color: item.color }}>{item.type}</div>
                <div className="text-[11px] text-foreground/30 leading-relaxed">{item.fields}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center">
            <a href="/auction/create" className="btn-apple px-8 py-3 text-[14px] inline-flex items-center gap-2">
              Create a Sealed-Bid Auction <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </motion.div>

      </div>
    </div>
  );
}

interface DemoPanelProps {
  role: "A" | "B";
  label: string;
  fieldLabel: string;
  colorAccent: string;
  price: string;
  partyState: PartyState;
  ciphertext: string;
  unit: string;
  note: string;
}

function DemoPanel({ role, label, fieldLabel, colorAccent, price, partyState, ciphertext, unit, note }: DemoPanelProps) {
  const isReady = partyState === "ready";
  const isEncrypting = partyState === "encrypting";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: role === "A" ? 0.15 : 0.25, duration: 0.5, ease: [0.32, 0, 0, 1] }}
      className="apple-card p-5 flex flex-col gap-4 transition-all duration-300"
      style={isReady ? { borderColor: `${colorAccent}30` } : {}}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold"
            style={{ background: `${colorAccent}18`, color: colorAccent }}
          >
            {role}
          </div>
          <span className="text-[14px] font-semibold text-foreground sf-headline">{label}</span>
        </div>
        {isReady && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260 }}>
            <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-[rgba(48,209,88,0.1)] text-[#30d158] border border-[rgba(48,209,88,0.2)]">
              Encrypted
            </span>
          </motion.div>
        )}
      </div>

      {/* Read-only price display */}
      <div>
        <p className="text-[11px] font-semibold text-foreground/30 uppercase tracking-widest mb-2">{fieldLabel}</p>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/35 text-[15px]">$</span>
          <div className="apple-input w-full py-3 pl-8 pr-10 text-[15px] min-h-[46px] flex items-center select-none cursor-default">
            <span className={price ? "text-foreground" : "text-foreground/20"}>
              {price || <span className="text-foreground/20">—</span>}
            </span>
          </div>
          {unit && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-foreground/30 text-[12px] font-mono">{unit}</span>}
        </div>
        <p className="text-[11px] text-foreground/25 mt-1.5">{note}</p>
      </div>

      {/* Ciphertext */}
      {isReady && ciphertext && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="rounded-xl p-3.5 overflow-hidden"
          style={{ background: `${colorAccent}0d`, border: `1px solid ${colorAccent}25` }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Lock className="w-3 h-3" style={{ color: colorAccent }} />
            <span className="text-[11px] font-mono font-semibold" style={{ color: colorAccent }}>euint64 on-chain</span>
          </div>
          <div className="hex-display break-all" style={{ color: `${colorAccent}aa` }}>
            {ciphertext.slice(0, 60)}…
          </div>
        </motion.div>
      )}

      {/* Status bar */}
      <div
        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold mt-auto"
        style={isReady
          ? { background: `${colorAccent}10`, color: colorAccent }
          : isEncrypting
            ? { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }
            : { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.2)" }
        }
      >
        {isEncrypting ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            Encrypting…
          </>
        ) : isReady ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Price encrypted on-chain
          </>
        ) : (
          <>
            <Lock className="w-3.5 h-3.5 opacity-40" />
            Waiting for input
          </>
        )}
      </div>
    </motion.div>
  );
}


