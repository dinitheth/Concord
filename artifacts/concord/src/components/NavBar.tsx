import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Inbox, Wallet, Sun, Moon, User, Gavel } from "lucide-react";
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
        background: "var(--subtle-bg)",
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
          background: "var(--green-subtle-bg)",
          border: "1px solid var(--green-subtle-border)",
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
        background: "var(--subtle-bg)",
        border: "1px solid var(--card-border-color)",
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
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between gap-1.5 sm:gap-2">
        <Link href="/" className="shrink-0 flex-shrink-0">
          <ConcordLogo size={22} showText={true} />
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Link href="/negotiate" className="hidden md:block text-[13px] hover:text-foreground transition-colors font-medium shrink-0" style={{ color: "var(--text-secondary)" }}>
            How it Works
          </Link>

          {/* Auctions */}
          <Link href="/auction/create" className="shrink-0 flex-shrink-0">
            <button
              className="relative flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-full transition-all duration-200"
              style={{
                background: location.startsWith("/auction") ? "rgba(255,149,0,0.1)" : "var(--subtle-bg)",
                border: location.startsWith("/auction") ? "1px solid rgba(255,149,0,0.3)" : "1px solid var(--card-border-color)",
                color: location.startsWith("/auction") ? "#ff9500" : "hsl(var(--foreground))",
                opacity: location.startsWith("/auction") ? 1 : 0.7
              }}
            >
              <Gavel className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium hidden sm:inline">Auctions</span>
            </button>
          </Link>

          {/* On-Chain Inbox */}
          <Link href="/inbox" className="shrink-0 flex-shrink-0">
            <button
              className="relative flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-full transition-all duration-200"
              style={{
                background: location === "/inbox" ? "var(--purple-subtle-bg)" : "var(--subtle-bg)",
                border: location === "/inbox" ? "1px solid var(--purple-subtle-border)" : "1px solid var(--card-border-color)",
                color: location === "/inbox" ? "#a78bfa" : "hsl(var(--foreground))",
                opacity: location === "/inbox" ? 1 : 0.7
              }}
            >
              <Inbox className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium hidden sm:inline">Inbox</span>
              {unread > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse"
                  style={{ background: "#ff453a", color: "#fff" }}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </Link>

          {/* Profile */}
          <Link href="/profile" className="shrink-0 flex-shrink-0">
            <button
              className="relative flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-full transition-all duration-200"
              style={{
                background: location === "/profile" ? "rgba(10,132,255,0.1)" : "var(--subtle-bg)",
                border: location === "/profile" ? "1px solid rgba(10,132,255,0.3)" : "1px solid var(--card-border-color)",
                color: location === "/profile" ? "#0a84ff" : "hsl(var(--foreground))",
                opacity: location === "/profile" ? 1 : 0.7
              }}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium hidden sm:inline">Profile</span>
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
