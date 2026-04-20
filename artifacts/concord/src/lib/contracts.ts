/**
 * Smart contract interaction layer for BlindNegotiation.sol
 * 
 * Provides typed wrappers around the on-chain contract using viem.
 * The contract is deployed on Base Sepolia.
 */

import { type Address, type Hex, encodeFunctionData, decodeFunctionResult } from "viem";
import { baseSepolia } from "wagmi/chains";

// ── Contract Address ────────────────────────────────────────────
// Deployed on Base Sepolia via Foundry
// Will be updated after deployment
export const BLIND_NEGOTIATION_ADDRESS: Address = "0xd7FA8ad77cfAa55674af496088f8D3723F9ff402";

// ── Contract ABI ────────────────────────────────────────────────
export const BLIND_NEGOTIATION_ABI = [
  // createRoom
  {
    type: "function",
    name: "createRoom",
    inputs: [
      { name: "roomId", type: "bytes32" },
      { name: "encFloor", type: "tuple", components: [
        { name: "ctHash", type: "uint256" },
        { name: "securityZone", type: "uint8" },
        { name: "utype", type: "uint8" },
        { name: "signature", type: "bytes" },
      ]},
      { name: "nType", type: "uint8" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // joinAndCompute
  {
    type: "function",
    name: "joinAndCompute",
    inputs: [
      { name: "roomId", type: "bytes32" },
      { name: "encCeiling", type: "tuple", components: [
        { name: "ctHash", type: "uint256" },
        { name: "securityZone", type: "uint8" },
        { name: "utype", type: "uint8" },
        { name: "signature", type: "bytes" },
      ]},
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // publishResult
  {
    type: "function",
    name: "publishResult",
    inputs: [
      { name: "roomId", type: "bytes32" },
      { name: "_matched", type: "bool" },
      { name: "_agreedPrice", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // getRoomStatus
  {
    type: "function",
    name: "getRoomStatus",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  // getRoomInfo
  {
    type: "function",
    name: "getRoomInfo",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [
      { name: "partyA", type: "address" },
      { name: "partyB", type: "address" },
      { name: "status", type: "uint8" },
      { name: "createdAt", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "negotiationType", type: "uint8" },
      { name: "isResultPublished", type: "bool" },
      { name: "matched", type: "bool" },
      { name: "agreedPrice", type: "uint64" },
    ],
    stateMutability: "view",
  },
  // getEncryptedResult
  {
    type: "function",
    name: "getEncryptedResult",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [
      { name: "encAgreedPrice", type: "uint256" },
      { name: "encMatched", type: "uint256" },
    ],
    stateMutability: "view",
  },
  // getRoomCount
  {
    type: "function",
    name: "getRoomCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // roomExists
  {
    type: "function",
    name: "roomExists",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // resultPublished
  {
    type: "function",
    name: "resultPublished",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // matchResult
  {
    type: "function",
    name: "matchResult",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // publishedPrice
  {
    type: "function",
    name: "publishedPrice",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint64" }],
    stateMutability: "view",
  },
  // Events
  {
    type: "event",
    name: "RoomCreated",
    inputs: [
      { name: "roomId", type: "bytes32", indexed: true },
      { name: "partyA", type: "address", indexed: true },
      { name: "nType", type: "uint8", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoomJoined",
    inputs: [
      { name: "roomId", type: "bytes32", indexed: true },
      { name: "partyB", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MatchComputed",
    inputs: [
      { name: "roomId", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ResultPublished",
    inputs: [
      { name: "roomId", type: "bytes32", indexed: true },
      { name: "matched", type: "bool", indexed: false },
      { name: "agreedPrice", type: "uint64", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  // ── On-Chain Invite Functions ────────────────────────────────
  // sendInvite
  {
    type: "function",
    name: "sendInvite",
    inputs: [
      { name: "roomId", type: "bytes32" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // getReceivedInvites
  {
    type: "function",
    name: "getReceivedInvites",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [
      { name: "", type: "tuple[]", components: [
        { name: "roomId", type: "bytes32" },
        { name: "sender", type: "address" },
        { name: "timestamp", type: "uint256" },
        { name: "negotiationType", type: "uint8" },
      ]},
    ],
    stateMutability: "view",
  },
  // getSentInvites
  {
    type: "function",
    name: "getSentInvites",
    inputs: [{ name: "sender", type: "address" }],
    outputs: [
      { name: "", type: "tuple[]", components: [
        { name: "roomId", type: "bytes32" },
        { name: "sender", type: "address" },
        { name: "timestamp", type: "uint256" },
        { name: "negotiationType", type: "uint8" },
      ]},
    ],
    stateMutability: "view",
  },
  // getReceivedInviteCount
  {
    type: "function",
    name: "getReceivedInviteCount",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // getSentInviteCount
  {
    type: "function",
    name: "getSentInviteCount",
    inputs: [{ name: "sender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // InviteSent event
  {
    type: "event",
    name: "InviteSent",
    inputs: [
      { name: "roomId", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

// ── Types ───────────────────────────────────────────────────────

export enum RoomStatus {
  Open = 0,
  PendingB = 1,
  Computing = 2,
  Settled = 3,
  Expired = 4,
}

export interface OnChainRoom {
  partyA: Address;
  partyB: Address;
  status: RoomStatus;
  createdAt: bigint;
  deadline: bigint;
  negotiationType: number;
  isResultPublished: boolean;
  matched: boolean;
  agreedPrice: bigint;
}

export interface EncryptedResult {
  encAgreedPrice: bigint;
  encMatched: bigint;
}

// ── Contract Config ─────────────────────────────────────────────

export const contractConfig = {
  address: BLIND_NEGOTIATION_ADDRESS,
  abi: BLIND_NEGOTIATION_ABI,
  chainId: baseSepolia.id,
} as const;

// ── Helper Functions ────────────────────────────────────────────

/**
 * Generate a deterministic room ID from a seed
 */
export function generateRoomIdBytes32(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")) as Hex;
}

/**
 * Convert a room code (6 chars) to match against room IDs
 */
export function roomIdToCode(roomId: Hex): string {
  const hex = roomId.slice(2, 8).toUpperCase();
  return `${hex.slice(0, 3)}·${hex.slice(3, 6)}`;
}

/**
 * Get the block explorer URL for a transaction
 */
export function getExplorerTxUrl(txHash: Hex): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}

/**
 * Get the block explorer URL for the contract
 */
export function getExplorerContractUrl(): string {
  return `https://sepolia.basescan.org/address/${BLIND_NEGOTIATION_ADDRESS}`;
}

/**
 * Map on-chain status number to our status string
 */
export function mapOnChainStatus(status: number): "open" | "pending_b" | "computing" | "settled" | "expired" {
  switch (status) {
    case 0: return "open";
    case 1: return "pending_b";
    case 2: return "computing";
    case 3: return "settled";
    case 4: return "expired";
    default: return "open";
  }
}
