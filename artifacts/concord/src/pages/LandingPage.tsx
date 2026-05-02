import { useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Lock, Zap, CheckCircle2, Users, TrendingUp, Building2, Home, Globe, ShieldCheck } from "lucide-react";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";

const steps = [
  {
    icon: Lock,
    number: "01",
    title: "Party A locks in their floor",
    desc: "Your minimum price is encrypted on your device before it touches any network. The number never leaves your browser in plaintext.",
    color: "#0a84ff",
    glow: "rgba(10,132,255,0.35)",
    ring: "rgba(10,132,255,0.2)",
  },
  {
    icon: Users,
    number: "02",
    title: "Party B submits their ceiling",
    desc: "The counterparty joins via a private link and submits their maximum. Both numbers live on-chain as indistinguishable ciphertext.",
    color: "#5ac8fa",
    glow: "rgba(90,200,250,0.35)",
    ring: "rgba(90,200,250,0.2)",
  },
  {
    icon: Zap,
    number: "03",
    title: "FHE computes in the dark",
    desc: "The Fhenix coprocessor computes entirely in encrypted space. No node, no validator, no party sees either number.",
    color: "#bf5af2",
    glow: "rgba(191,90,242,0.35)",
    ring: "rgba(191,90,242,0.2)",
  },
  {
    icon: CheckCircle2,
    number: "04",
    title: "Result only. Numbers stay hidden.",
    desc: "Deal or no-deal, plus the midpoint if matched. That's all anyone learns. Both reservation prices remain private forever.",
    color: "#30d158",
    glow: "rgba(48,209,88,0.35)",
    ring: "rgba(48,209,88,0.2)",
  },
];

const useCases = [
  { icon: Building2, title: "M&A", desc: "Floor $80M, ceiling $95M. Deal found at $87.5M. Neither party's price disclosed." },
  { icon: TrendingUp, title: "Salary", desc: "Candidate wants $180K, company budgets $210K. Match at $195K. Zero awkwardness." },
  { icon: Home, title: "Real Estate", desc: "Minimum $650K, max offer $700K. Closes at $675K without a mediator." },
  { icon: Globe, title: "Bond Pricing", desc: "Private yield discovery with automatic settlement via ReineiraOS ConfidentialEscrow." },
];

function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-28 px-6" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.32, 0, 0, 1] }}
          className="text-center mb-20"
        >
          <p className="text-[13px] font-semibold text-[#0a84ff] tracking-widest uppercase mb-3">How it works</p>
          <h2 className="sf-display text-4xl text-foreground mb-3">Four steps. Zero leakage.</h2>
          <p className="text-foreground/50 text-[17px]">Private by design, not by policy.</p>
        </motion.div>

        {/* Desktop */}
        <div className="hidden md:block relative">
          {/* Connector line */}
          <div className="absolute top-[52px] left-[12.5%] right-[12.5%] h-px overflow-hidden rounded-full">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ duration: 1.6, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
              className="w-full h-full origin-left"
              style={{ background: "linear-gradient(90deg, #0a84ff, #5ac8fa, #bf5af2, #30d158)" }}
            />
          </div>

          {/* Travelling glow on line */}
          {inView && (
            <div className="absolute top-[44px] left-[12.5%] right-[12.5%] h-4 pointer-events-none overflow-hidden">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "200%" }}
                transition={{ duration: 2.2, ease: "easeInOut", delay: 2, repeat: Infinity, repeatDelay: 4 }}
                className="absolute inset-y-0 w-16 blur-md"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)" }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 36 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.65, delay: 0.15 + i * 0.14, type: "spring", stiffness: 80, damping: 14 }}
                className="flex flex-col items-center text-center"
              >
                <div className="relative mb-8">
                  <motion.div
                    animate={inView ? {
                      boxShadow: [`0 0 0px ${step.glow.replace("0.35", "0")}`, `0 0 22px ${step.glow}`, `0 0 0px ${step.glow.replace("0.35", "0")}`],
                    } : {}}
                    transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.65, ease: "easeInOut" }}
                    className="w-[104px] h-[104px] rounded-full flex items-center justify-center"
                    style={{ background: `rgba(${step.color === "#0a84ff" ? "10,132,255" : step.color === "#5ac8fa" ? "90,200,250" : step.color === "#bf5af2" ? "191,90,242" : "48,209,88"}, 0.08)`, border: `1.5px solid ${step.ring}` }}
                  >
                    <motion.div
                      animate={inView ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.65, ease: "easeInOut" }}
                    >
                      <step.icon className="w-8 h-8" style={{ color: step.color }} strokeWidth={1.75} />
                    </motion.div>
                    {/* Number badge */}
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={inView ? { scale: 1, opacity: 1 } : {}}
                      transition={{ delay: 0.5 + i * 0.14, type: "spring", stiffness: 200 }}
                      className="absolute -top-1.5 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold font-mono"
                      style={{ background: "hsl(var(--card))", border: `1px solid ${step.ring}`, color: step.color, boxShadow: "var(--card-shadow)" }}
                    >
                      {step.number}
                    </motion.div>
                  </motion.div>
                </div>

                <motion.h3
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.4 + i * 0.14 }}
                  className="font-semibold text-[15px] text-foreground mb-2 leading-snug sf-headline"
                >
                  {step.title}
                </motion.h3>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.5 + i * 0.14 }}
                  className="text-[13px] text-foreground/45 leading-relaxed"
                >
                  {step.desc}
                </motion.p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-4">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.12, type: "spring", stiffness: 100 }}
              className="apple-card p-5 flex items-start gap-4"
            >
              <div
                className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center mt-0.5"
                style={{ background: `rgba(${step.color === "#0a84ff" ? "10,132,255" : step.color === "#5ac8fa" ? "90,200,250" : step.color === "#bf5af2" ? "191,90,242" : "48,209,88"}, 0.12)` }}
              >
                <step.icon className="w-5 h-5" style={{ color: step.color }} strokeWidth={2} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono font-bold" style={{ color: step.color }}>{step.number}</span>
                  <h3 className="text-[14px] font-semibold text-foreground sf-headline">{step.title}</h3>
                </div>
                <p className="text-[13px] text-foreground/45 leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      {/* Hero */}
      <section className="relative pt-36 pb-28 px-6 overflow-hidden">
        {/* Subtle gradient orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-25 blur-3xl"
            style={{ background: "radial-gradient(ellipse, rgba(10,132,255,0.4) 0%, transparent 70%)" }} />
        </div>

        <div className="max-w-3xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-center gap-2.5 mb-8"
          >
            <FHEBadge label="Fhenix CoFHE" />
            <FHEBadge variant="reineira" label="ReineiraOS" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.32, 0, 0, 1] }}
            className="sf-display concord-hero-h1 text-foreground mb-5"
          >
            Find your deal.<br />
            <span style={{ color: "#0a84ff" }}>Without revealing</span><br />
            your number.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18, ease: [0.32, 0, 0, 1] }}
            className="text-[15px] sm:text-[17px] md:text-[19px] text-foreground/50 max-w-lg mx-auto mb-10 leading-relaxed"
            style={{ letterSpacing: "-0.01em" }}
          >
            Two parties discover if they have a deal, and at what price, without either one ever revealing their number.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.26 }}
          >
            <button
              onClick={() => navigate("/role")}
              className="btn-apple px-8 py-3 text-[15px] inline-flex items-center gap-2 glow-blue"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Separator */}
      <div className="separator max-w-5xl mx-auto" />

      <HowItWorks />

      {/* Separator */}
      <div className="separator max-w-5xl mx-auto" />

      {/* Use Cases */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <p className="text-[13px] font-semibold text-[#0a84ff] tracking-widest uppercase mb-3">Use cases</p>
            <h2 className="sf-display text-4xl text-foreground">Every negotiation. One protocol.</h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {useCases.map((uc, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="apple-card p-5 transition-colors duration-200 theme-subtle-bg-hover"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "var(--blue-subtle-bg)" }}
                >
                  <uc.icon className="w-4.5 h-4.5 text-[#0a84ff]" strokeWidth={2} />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground mb-1.5 sf-headline">{uc.title}</h3>
                <p className="text-[13px] text-foreground/45 leading-relaxed">{uc.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Separator */}
      <div className="separator max-w-5xl mx-auto" />

      {/* Why FHE */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <p className="text-[13px] font-semibold text-[#0a84ff] tracking-widest uppercase mb-3">The technology</p>
            <h2 className="sf-display text-4xl text-foreground">Why FHE changes everything</h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="concord-table-scroll"
          >
          <div
            className="overflow-hidden rounded-2xl"
            style={{ border: "1px solid var(--card-border-color)" }}
          >
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr", background: "var(--subtle-bg)", borderBottom: "1px solid var(--divider)" }}>
              <div className="px-5 py-4" />
              {[
                { label: "Traditional Escrow", status: "Broken", statusColor: "#ff453a", statusBg: "rgba(255,69,58,0.1)", colBg: "rgba(255,69,58,0.03)" },
                { label: "Zero-Knowledge Proofs", status: "Insufficient", statusColor: "#ffd60a", statusBg: "rgba(255,214,10,0.1)", colBg: "rgba(255,214,10,0.02)" },
                { label: "Fhenix CoFHE", status: "The solution", statusColor: "#30d158", statusBg: "rgba(48,209,88,0.1)", colBg: "rgba(48,209,88,0.04)" },
              ].map((col, i) => (
                <div key={i} className="px-5 py-4" style={{ background: col.colBg, borderLeft: "1px solid var(--divider)" }}>
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-bold rounded-full px-2.5 py-0.5 mb-2" style={{ background: col.statusBg, color: col.statusColor }}>
                    {col.status}
                  </div>
                  <div className="text-[14px] font-semibold text-foreground sf-headline">{col.label}</div>
                </div>
              ))}
            </div>

            {/* Table rows */}
            {[
              {
                feature: "How it works",
                vals: [
                  "Prices disclosed to a trusted third party who computes the match.",
                  "Proves a single fact about one input. Cannot process two secrets simultaneously.",
                  "Computes on both encrypted inputs at once. The result emerges; neither price is ever seen.",
                ],
                isText: true,
              },
              {
                feature: "Requires trusted party",
                vals: ["Yes", "No", "No"],
                checks: ["bad", "good", "good"],
                isText: false,
              },
              {
                feature: "Computes on two private inputs",
                vals: ["No", "No", "Yes"],
                checks: ["bad", "bad", "good"],
                isText: false,
              },
              {
                feature: "Both prices stay hidden",
                vals: ["No", "Partial", "Yes"],
                checks: ["bad", "warn", "good"],
                isText: false,
              },
              {
                feature: "Works on-chain",
                vals: ["No", "Yes", "Yes"],
                checks: ["bad", "good", "good"],
                isText: false,
              },
            ].map((row, ri) => (
              <div
                key={ri}
                style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr 1fr", borderTop: "1px solid var(--divider)" }}
              >
                <div className="px-5 py-4 flex items-center">
                  <span className="text-[12px] font-semibold text-foreground/40">{row.feature}</span>
                </div>
                {row.vals.map((val, ci) => {
                  const colBgs = ["rgba(255,69,58,0.02)", "rgba(255,214,10,0.01)", "rgba(48,209,88,0.02)"];
                  const checkColors: Record<string, string> = { good: "#30d158", bad: "#ff453a", warn: "#ffd60a" };
                  const check = row.isText ? null : row.checks![ci];
                  return (
                    <div key={ci} className="px-5 py-4 flex items-center" style={{ background: colBgs[ci], borderLeft: "1px solid var(--divider)" }}>
                      {row.isText ? (
                        <span className="text-[12px] text-foreground/40 leading-relaxed">{val}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: `${checkColors[check!]}18` }}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: checkColors[check!] }} />
                          </div>
                          <span className="text-[13px] font-semibold" style={{ color: checkColors[check!] }}>{val}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center apple-card p-8 sm:p-14"
        >
          <ShieldCheck className="w-10 h-10 text-[#0a84ff] mx-auto mb-5" strokeWidth={1.75} />
          <h2 className="sf-display text-2xl sm:text-4xl text-foreground mb-3">Ready to find your deal?</h2>
          <p className="text-foreground/45 text-[17px] mb-8">
            Both parties enter their price on one page. FHE computes the match. Done.
          </p>
          <button
            onClick={() => navigate("/role")}
            className="btn-apple px-10 py-3.5 text-[15px] inline-flex items-center gap-2 glow-blue"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </section>

      {/* Footer */}
      <div className="separator" />
      <footer className="py-6 px-6 text-center">
        <p className="text-[12px] text-foreground/25">
          Concord. Built with <span style={{ color: "#0052ff", fontWeight: 600 }}>Base</span> & <span style={{ color: "#7B68EE", fontWeight: 600 }}>Fhenix CoFHE</span>. Fully homomorphic encryption for private price discovery.
        </p>
      </footer>
    </div>
  );
}



