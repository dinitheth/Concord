/**
 * Smart contract interaction layer for BlindNegotiation.sol
 * 
 * Provides typed wrappers around the on-chain contract using viem.
 * The contract is deployed on Base Sepolia.
 */

import { type Address, type Hex, encodeFunctionData, decodeFunctionResult } from "viem";
import { baseSepolia } from "wagmi/chains";

// ── Contract Addresses ──────────────────────────────────────────
// Wave 4 deployment — Base Sepolia (Chain 84532)
export const BLIND_NEGOTIATION_ADDRESS: Address  = "0x22F29DE6B4894970a8D929f5536Bb1132A15dec1";
export const CONFIDENTIAL_ESCROW_ADDRESS: Address = "0x305a0d88419F3f7024e5f661b977D9F12fd398EC";

// USDC on Base Sepolia
export const USDC_ADDRESS: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

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
      { name: "encAgreedPrice", type: "bytes32" },
      { name: "encMatched", type: "bytes32" },
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
  // getEncryptedResult
  {
    type: "function",
    name: "getEncryptedResult",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [
      { name: "encAgreedPrice", type: "bytes32" },
      { name: "encMatched", type: "bytes32" }
    ],
    stateMutability: "view",
  },
  // publishResult
  {
    type: "function",
    name: "publishResult",
    inputs: [
      { name: "roomId", type: "bytes32" },
      { name: "_matched", type: "bool" },
      { name: "_agreedPrice", type: "uint64" }
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Wave 4: getPublishedResult (used by ConfidentialEscrow)
  {
    type: "function",
    name: "getPublishedResult",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [
      { name: "isPublished", type: "bool" },
      { name: "matched", type: "bool" },
      { name: "agreedPrice", type: "uint64" },
    ],
    stateMutability: "view",
  },
] as const;

// ── Confidential Escrow ABI ─────────────────────────────────────
export const CONFIDENTIAL_ESCROW_ABI = [
  // depositEscrow
  {
    type: "function",
    name: "depositEscrow",
    inputs: [
      { name: "roomId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "seller", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // settleEscrow
  {
    type: "function",
    name: "settleEscrow",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // emergencyRefund
  {
    type: "function",
    name: "emergencyRefund",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // getEscrow
  {
    type: "function",
    name: "getEscrow",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [
      { name: "", type: "tuple", components: [
        { name: "buyer",         type: "address" },
        { name: "seller",        type: "address" },
        { name: "depositAmount", type: "uint256" },
        { name: "agreedAmount",  type: "uint256" },
        { name: "status",        type: "uint8"   },
        { name: "depositedAt",   type: "uint256" },
      ]},
    ],
    stateMutability: "view",
  },
  // hasActiveEscrow
  {
    type: "function",
    name: "hasActiveEscrow",
    inputs: [{ name: "roomId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // EscrowDeposited event
  {
    type: "event",
    name: "EscrowDeposited",
    inputs: [
      { name: "roomId",  type: "bytes32", indexed: true  },
      { name: "buyer",   type: "address", indexed: true  },
      { name: "seller",  type: "address", indexed: true  },
      { name: "amount",  type: "uint256", indexed: false },
    ],
  },
  // EscrowSettled event
  {
    type: "event",
    name: "EscrowSettled",
    inputs: [
      { name: "roomId",       type: "bytes32", indexed: true  },
      { name: "seller",       type: "address", indexed: true  },
      { name: "agreedAmount", type: "uint256", indexed: false },
      { name: "refundAmount", type: "uint256", indexed: false },
    ],
  },
  // EscrowRefunded event
  {
    type: "event",
    name: "EscrowRefunded",
    inputs: [
      { name: "roomId", type: "bytes32", indexed: true  },
      { name: "buyer",  type: "address", indexed: true  },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

// ── USDC ERC20 ABI (minimal — approve + balanceOf + allowance) ──
export const USDC_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
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

// ── Contract Configs ─────────────────────────────────────────────

export const contractConfig = {
  address: BLIND_NEGOTIATION_ADDRESS,
  abi: BLIND_NEGOTIATION_ABI,
  chainId: baseSepolia.id,
} as const;

export const escrowConfig = {
  address: CONFIDENTIAL_ESCROW_ADDRESS,
  abi: CONFIDENTIAL_ESCROW_ABI,
  chainId: baseSepolia.id,
} as const;

export const usdcConfig = {
  address: USDC_ADDRESS,
  abi: USDC_ABI,
  chainId: baseSepolia.id,
} as const;

// ── Escrow Types ────────────────────────────────────────────────

export enum EscrowStatus {
  None      = 0,
  Deposited = 1,
  Settled   = 2,
  Refunded  = 3,
}

export interface OnChainEscrow {
  buyer:         Address;
  seller:        Address;
  depositAmount: bigint;   // USDC units (6 decimals)
  agreedAmount:  bigint;   // USDC units (6 decimals)
  status:        EscrowStatus;
  depositedAt:   bigint;
}

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

export function getEscrowExplorerUrl(): string {
  return `https://sepolia.basescan.org/address/${CONFIDENTIAL_ESCROW_ADDRESS}`;
}

/**
 * Format USDC amount (6 decimals) to human-readable string
 * e.g. 80000000n → "80.00"
 */
export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac  = amount % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

/**
 * Convert human price units (e.g. 80 for $80M) to USDC units (6 decimals)
 * e.g. 80n → 80_000_000n
 */
export function priceToUsdc(price: bigint): bigint {
  return price * 1_000_000n;
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

// ── Wave 5: Multi-Party Auction ─────────────────────────────────

export const MULTI_PARTY_AUCTION_ADDRESS: Address = "0x843b013bb104e416EeA8C8cC00C377B095A1c592";

export const MULTI_PARTY_AUCTION_ABI = [
  // createAuction
  {
    type: "function",
    name: "createAuction",
    inputs: [
      { name: "auctionId", type: "bytes32" },
      { name: "encFloor", type: "tuple", components: [
        { name: "ctHash", type: "uint256" },
        { name: "securityZone", type: "uint8" },
        { name: "utype", type: "uint8" },
        { name: "signature", type: "bytes" },
      ]},
      { name: "nType", type: "uint8" },
      { name: "deadline", type: "uint256" },
      { name: "maxBidders", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // submitBid
  {
    type: "function",
    name: "submitBid",
    inputs: [
      { name: "auctionId", type: "bytes32" },
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
  // computeAuction
  {
    type: "function",
    name: "computeAuction",
    inputs: [{ name: "auctionId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // publishResult
  {
    type: "function",
    name: "publishResult",
    inputs: [
      { name: "auctionId", type: "bytes32" },
      { name: "_matched", type: "bool" },
      { name: "_agreedPrice", type: "uint64" },
      { name: "_winner", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // getAuctionInfo
  {
    type: "function",
    name: "getAuctionInfo",
    inputs: [{ name: "auctionId", type: "bytes32" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "status", type: "uint8" },
      { name: "createdAt", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "negotiationType", type: "uint8" },
      { name: "maxBidders", type: "uint8" },
      { name: "currentBids", type: "uint8" },
      { name: "isResultPublished", type: "bool" },
      { name: "matched", type: "bool" },
      { name: "agreedPrice", type: "uint64" },
      { name: "winner", type: "address" },
    ],
    stateMutability: "view",
  },
  // getBidCount
  {
    type: "function",
    name: "getBidCount",
    inputs: [{ name: "auctionId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // getBidder
  {
    type: "function",
    name: "getBidder",
    inputs: [
      { name: "auctionId", type: "bytes32" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  // getEncryptedResult
  {
    type: "function",
    name: "getEncryptedResult",
    inputs: [{ name: "auctionId", type: "bytes32" }],
    outputs: [
      { name: "encAgreedPrice", type: "bytes32" },
      { name: "encHasWinner", type: "bytes32" },
      { name: "encWinnerIndex", type: "bytes32" },
    ],
    stateMutability: "view",
  },
  // getPublishedResult
  {
    type: "function",
    name: "getPublishedResult",
    inputs: [{ name: "auctionId", type: "bytes32" }],
    outputs: [
      { name: "isPublished", type: "bool" },
      { name: "matched", type: "bool" },
      { name: "agreedPrice", type: "uint64" },
      { name: "winner", type: "address" },
    ],
    stateMutability: "view",
  },
  // auctionExists
  {
    type: "function",
    name: "auctionExists",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // sendInvite
  {
    type: "function",
    name: "sendInvite",
    inputs: [
      { name: "auctionId", type: "bytes32" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // sendBatchInvites
  {
    type: "function",
    name: "sendBatchInvites",
    inputs: [
      { name: "auctionId", type: "bytes32" },
      { name: "recipients", type: "address[]" },
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
        { name: "auctionId", type: "bytes32" },
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
        { name: "auctionId", type: "bytes32" },
        { name: "sender", type: "address" },
        { name: "timestamp", type: "uint256" },
        { name: "negotiationType", type: "uint8" },
      ]},
    ],
    stateMutability: "view",
  },
  // Events
  {
    type: "event",
    name: "AuctionCreated",
    inputs: [
      { name: "auctionId", type: "bytes32", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "nType", type: "uint8", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
      { name: "maxBidders", type: "uint8", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BidSubmitted",
    inputs: [
      { name: "auctionId", type: "bytes32", indexed: true },
      { name: "bidder", type: "address", indexed: true },
      { name: "bidIndex", type: "uint8", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AuctionComputed",
    inputs: [
      { name: "auctionId", type: "bytes32", indexed: true },
      { name: "totalBids", type: "uint8", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AuctionResultPublished",
    inputs: [
      { name: "auctionId", type: "bytes32", indexed: true },
      { name: "matched", type: "bool", indexed: false },
      { name: "agreedPrice", type: "uint64", indexed: false },
      { name: "winner", type: "address", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export enum AuctionStatus {
  Open = 0,
  BiddingOpen = 1,
  Computing = 2,
  Settled = 3,
  Expired = 4,
}

export interface OnChainAuction {
  seller: Address;
  status: AuctionStatus;
  createdAt: bigint;
  deadline: bigint;
  negotiationType: number;
  maxBidders: number;
  currentBids: number;
  isResultPublished: boolean;
  matched: boolean;
  agreedPrice: bigint;
  winner: Address;
}

export const auctionConfig = {
  address: MULTI_PARTY_AUCTION_ADDRESS,
  abi: MULTI_PARTY_AUCTION_ABI,
  chainId: baseSepolia.id,
} as const;

export function mapAuctionStatus(status: number): "open" | "bidding" | "computing" | "settled" | "expired" {
  switch (status) {
    case 0: return "open";
    case 1: return "bidding";
    case 2: return "computing";
    case 3: return "settled";
    case 4: return "expired";
    default: return "open";
  }
}

export function getAuctionExplorerUrl(): string {
  return `https://sepolia.basescan.org/address/${MULTI_PARTY_AUCTION_ADDRESS}`;
}

