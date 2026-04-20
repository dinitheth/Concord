import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Inbox, Wallet, Sun, Moon } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { useModal } from "connectkit";
import ConcordLogo from "@/components/ConcordLogo";
import { BLIND_NEGOTIATION_ABI, BLIND_NEGOTIATION_ADDRESS } from "@/lib/contracts";
import { useTheme } from "@/lib/ThemeContext";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center p-1.5 rounded-full transition-all duration-200 shrink-0"
      style={{
        background: "rgba(128,128,128,0.1)",
        color: "hsl(var(--foreground))",
      }}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 opacity-70 hover:opacity-100 transition-opacity" />
      ) : (
        <Moon className="w-4 h-4 opacity-70 hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

function WalletButton() {
  const { address, isConnected } = useAccount();
  const { setOpen } = useModal();

  if (isConnected && address) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2 flex-shrink-0 sm:px-2.5 py-1.5 rounded-full transition-all duration-200 shrink-0"
        style={{
          background: "rgba(48,209,88,0.08)",
          border: "1px solid rgba(48,209,88,0.2)",
          color: "hsl(var(--foreground))", opacity: 0.75,
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: "#30d158" }}
        />
        <span className="font-mono text-[11px] font-medium tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
          {address.slice(0, 6)}&hellip;{address.slice(-4)}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-full transition-all duration-200 shrink-0 whitespace-nowrap flex-shrink-0"
      style={{
        background: "rgba(128,128,128,0.05)",
        border: "1px solid rgba(128,128,128,0.15)",
        color: "hsl(var(--foreground))",
      }}
    >
      <Wallet className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[12px] font-medium hidden xs:inline sm:inline">Connect</span>
    </button>
  );
}

export default function NavBar() {
  const [location] = useLocation();
  const { address, isConnected } = useAccount();

  // Query on-chain inbox count for red dot notification
  const { data: inviteCount } = useReadContract({
    address: BLIND_NEGOTIATION_ADDRESS,
    abi: BLIND_NEGOTIATION_ABI,
    functionName: "getReceivedInviteCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConnected },
  });

  const unread = Number(inviteCount ?? 0);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass" style={{ borderBottom: "0.5px solid hsl(var(--))", background: "hsl(var(--background))", opacity: 0.9 }}>
      <div className="max-w-5xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between gap-1.5 sm:gap-2">
        <Link href="/" className="shrink-0 flex-shrink-0">
          <ConcordLogo size={22} showText={true} />
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Link href="/negotiate" className="hidden md:block text-[13px] text-foreground/50 hover:text-foreground transition-colors font-medium shrink-0">
            How it Works
          </Link>

          {/* On-Chain Inbox */}
          <Link href="/inbox" className="shrink-0 flex-shrink-0">
            <button
              className="relative flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-full transition-all duration-200"
              style={{
                background: location === "/inbox" ? "rgba(120,80,255,0.15)" : "rgba(128,128,128,0.05)",
                border: location === "/inbox" ? "1px solid rgba(120,80,255,0.35)" : "1px solid rgba(128,128,128,0.15)",
                color: location === "/inbox" ? "#a78bfa" : "hsl(var(--foreground))",
                opacity: location === "/inbox" ? 1 : 0.7
              }}
            >
              <Inbox className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium hidden sm:inline">Inbox</span>
              {unread > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse"
                  style={{ background: "#ff453a", color: "hsl(var(--foreground))" }}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </Link>

          <WalletButton />

          <ThemeToggle />

          <Link href="/role" className="btn-apple text-[12px] sm:text-[13px] px-2.5 sm:px-4 py-1.5 shrink-0 whitespace-nowrap flex-shrink-0">
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}


