import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Plus, LogIn, ArrowRight } from "lucide-react";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";

export default function RoleSelectPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0, 0, 1] }}
          className="text-center mb-12 max-w-lg"
        >
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <FHEBadge label="Fhenix CoFHE" />
          </div>
          <h1 className="sf-display text-[36px] text-foreground mb-3 leading-tight">
            Start a negotiation
          </h1>
          <p className="text-[15px] text-foreground/40 leading-relaxed">
            Both parties set their price privately. FHE computes whether a deal exists — no one sees the other's number.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          {/* Create Room (Party A) */}
          <motion.button
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.32, 0, 0, 1] }}
            onClick={() => navigate("/create")}
            className="group text-left apple-card p-7 hover:bg-black/5 dark:hover:bg-[#0a0a14] transition-all duration-200 cursor-pointer"
            style={{ borderColor: "#0a84ff" }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(10,132,255,0.1)" }}
            >
              <Plus className="w-6 h-6 text-[#0a84ff]" strokeWidth={2} />
            </div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="sf-display text-[22px] text-foreground">Create Room</h2>
              <ArrowRight className="w-5 h-5 text-foreground/20 group-hover:text-[#0a84ff] group-hover:translate-x-1 transition-all duration-200" />
            </div>
            <p className="text-[13px] text-foreground/40 leading-relaxed mb-5">
              Set your minimum acceptable price, then invite your counterparty. Your price encrypts on-device before it touches the chain.
            </p>
            <div className="space-y-2">
              {["Set your floor price (encrypted)", "Share room code with counterparty", "Result: deal or no deal"].map((step, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div
                    className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "rgba(10,132,255,0.12)", color: "#0a84ff" }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[12px] text-foreground/35">{step}</span>
                </div>
              ))}
            </div>
          </motion.button>

          {/* Join Room (Party B) */}
          <motion.button
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease: [0.32, 0, 0, 1] }}
            onClick={() => navigate("/join")}
            className="group text-left apple-card p-7 hover:bg-black/5 dark:hover:bg-[#0a1a0a] transition-all duration-200 cursor-pointer"
            style={{ borderColor: "#0a84ff" }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(48,209,88,0.1)" }}
            >
              <LogIn className="w-6 h-6 text-[#30d158]" strokeWidth={2} />
            </div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="sf-display text-[22px] text-foreground">Join Room</h2>
              <ArrowRight className="w-5 h-5 text-foreground/20 group-hover:text-[#30d158] group-hover:translate-x-1 transition-all duration-200" />
            </div>
            <p className="text-[13px] text-foreground/40 leading-relaxed mb-5">
              Enter the room code you received. Set your maximum price — it stays encrypted on-device — and the result is computed automatically.
            </p>
            <div className="space-y-2">
              {["Enter the room code you received", "Set your ceiling price (encrypted)", "Result: deal or no deal"].map((step, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div
                    className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "rgba(48,209,88,0.12)", color: "#30d158" }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[12px] text-foreground/35">{step}</span>
                </div>
              ))}
            </div>
          </motion.button>
        </div>

      </div>
    </div>
  );
}


