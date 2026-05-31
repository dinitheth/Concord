import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Hash, ArrowRight, AlertCircle } from "lucide-react";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";
import { getRoom } from "@/lib/concord";
import { useReadContract } from "wagmi";
import { BLIND_NEGOTIATION_ABI, BLIND_NEGOTIATION_ADDRESS, roomIdToCode } from "@/lib/contracts";

export default function JoinRoom() {
  const [, navigate] = useLocation();
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");

  /**
   * Try to find a room. Accepts two formats:
   *  1. Full bytes32 hex (0x...) — from on-chain inbox "Copy Code"
   *  2. Short 6-char code (e.g. CB5F83) — from same-browser localStorage
   */
  const findRoom = (val: string): string => {
    const trimmed = val.trim();

    // Format 1: Full hex bytes32 (66 chars including 0x)
    if (trimmed.startsWith("0x") && trimmed.length === 66) {
      // Check localStorage first
      const localRoom = getRoom(trimmed);
      if (localRoom) return trimmed;
      // Even without local data, if it looks like a valid hex, allow navigation
      // RoomPage will create a minimal entry and query on-chain
      return trimmed;
    }

    // Format 2: Short 6-char code — match against local rooms only
    const normalized = trimmed.replace(/[\s·\-\.]/g, "").toUpperCase();
    if (normalized.length < 3) return "";

    // Search localStorage for a room whose roomIdHex starts with this prefix
    const roomKeys = Object.keys(localStorage).filter(k => k.startsWith("concord_room_"));
    for (const key of roomKeys) {
      try {
        const room = JSON.parse(localStorage.getItem(key) || "{}");
        if (room.roomIdHex) {
          // roomIdToCode takes first 6 hex chars of the bytes32
          const roomCode = room.roomIdHex.slice(2, 8).toUpperCase();
          if (roomCode.startsWith(normalized) || normalized.startsWith(roomCode)) {
            return room.id; // This is now the roomIdHex
          }
        }
      } catch { /* skip */ }
    }

    return "";
  };

  const handleJoin = () => {
    setError("");
    const roomId = findRoom(codeInput);
    if (!roomId) {
      setError("Room not found. Paste the full room code from your On-Chain Inbox.");
      return;
    }
    navigate(`/room/${roomId}`);
  };

  const isFullHex = codeInput.trim().startsWith("0x") && codeInput.trim().length > 10;

  const formatDisplay = (val: string) => {
    // If it's a hex bytes32, show truncated
    if (val.trim().startsWith("0x") && val.trim().length > 10) {
      const hex = val.trim();
      return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
    }
    const clean = val.replace(/[\s·\-\.]/g, "").toUpperCase().slice(0, 6);
    if (clean.length <= 3) return clean;
    return `${clean.slice(0, 3)}·${clean.slice(3)}`;
  };

  const handleInput = (raw: string) => {
    // Allow full hex (0x...) or short code
    if (raw.startsWith("0x") || raw.startsWith("0X")) {
      setCodeInput(raw.slice(0, 66)); // Max bytes32 length
    } else {
      // Strip everything except hex chars, keep only 6 hex digits
      const hexOnly = raw.replace(/[^a-fA-F0-9]/g, "").slice(0, 6);
      setCodeInput(hexOnly);
    }
    setError("");
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-20 pb-20 px-6 max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0, 0, 1] }}
          className="pt-10 mb-6"
        >
          <FHEBadge label="End-to-end encrypted" variant="neutral" />
          <h1 className="sf-display text-[28px] text-foreground mt-4 mb-1">Join Room</h1>
          <p className="text-[13px] text-foreground/40">
            Enter the room code shared by your counterparty.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <div>
            <input
              type="text"
              value={codeInput}
              onChange={e => handleInput(e.target.value)}
              placeholder="e.g. A3F7B2"
              className="apple-input w-full py-4 px-5 text-[20px] font-mono text-center tracking-[0.15em] font-bold"
              style={{
                background: "rgba(10,132,255,0.04)",
                border: codeInput ? "1px solid rgba(10,132,255,0.3)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                boxShadow: codeInput ? "0 0 20px rgba(10,132,255,0.06)" : "none",
              }}
              onKeyDown={e => e.key === "Enter" && codeInput.trim() && handleJoin()}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 mt-3">
                <AlertCircle className="w-3.5 h-3.5 text-[#ff453a] shrink-0" />
                <span className="text-[12px] text-[#ff453a]">{error}</span>
              </motion.div>
            )}
          </div>

          <p className="text-[11px] text-foreground/25 text-center">
            Got an invite? Check your <a href="/inbox" style={{ color: "#0a84ff", textDecoration: "none" }}>Inbox</a> to join directly.
          </p>

          <button
            onClick={handleJoin}
            disabled={!codeInput.trim()}
            className="btn-apple w-full py-4 text-[15px] flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Open Room <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => navigate("/role")}
            className="btn-ghost w-full py-3.5 text-[14px] flex items-center justify-center"
          >
            Back
          </button>
        </motion.div>
      </div>
    </div>
  );
}


