export type NegotiationType = "ma" | "salary" | "realestate" | "custom";
export type PartyRole = "A" | "B";
export type RoomStatus = "open" | "pending_b" | "computing" | "settled" | "expired";
export type AuctionStatusType = "open" | "bidding" | "computing" | "settled" | "expired";

export type PriceUnit = "M" | "K" | "B" | "USD";

export interface Room {
  id: string;
  roomIdHex: string;          // bytes32 on-chain room ID
  type: NegotiationType;
  label: string;
  status: RoomStatus;
  myPrice?: number;           // Party A's raw price value (local only, never sent on-chain)
  myPriceUnit?: PriceUnit;   // The unit the user chose: M/K/B/USD
  dealName?: string;          // Optional deal title
  dealDesc?: string;          // Optional deal description
  selectedTerms?: string[];   // Selected deal terms
  deadlineStr?: string;       // ISO deadline string (for display)
  displayName?: string;       // Party A display name (off-chain)
  notifyAddr?: string;        // Invited counterparty address
  partyA?: {
    address: string;
    timestamp: number;
  };
  partyB?: {
    address: string;
    timestamp: number;
  };
  result?: {
    matched: boolean;
    agreedPrice?: number;
    timestamp: number;
    txHash?: string;
    escrowId?: string;
    isEncrypted?: boolean;
  };
  createdAt: number;
  deadline: number;
  txHash?: string; // Creation tx hash
}

// ── Wave 5: Auction Interface ───────────────────────────────────
export interface Auction {
  id: string;
  auctionIdHex: string;
  type: NegotiationType;
  label: string;
  status: AuctionStatusType;
  sellerPrice?: number;
  sellerPriceUnit?: PriceUnit;
  dealName?: string;
  dealDesc?: string;
  selectedTerms?: string[];
  maxBidders: number;
  bids: { address: string; timestamp: number }[];
  seller: { address: string; timestamp: number };
  result?: {
    matched: boolean;
    agreedPrice?: number;
    winnerAddress?: string;
    timestamp: number;
    txHash?: string;
    isEncrypted?: boolean;
  };
  metadata?: Record<string, string>;
  createdAt: number;
  deadline: number;
  txHash?: string;
}

// ── Industry Dashboard Field Definition ─────────────────────────
export interface IndustryField {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "number" | "select";
  options?: string[];
}

export const NEGOTIATION_TYPES: Record<NegotiationType, {
  label: string;
  description: string;
  detail: string;
  parties: { initiator: string; counterparty: string };
  partyALabel: string;
  partyBLabel: string;
  unit: string;
  placeholder: string;
  titlePlaceholder: string;
  descPlaceholder: string;
  terms: string[];
  // Wave 5: Industry dashboard fields
  resultLabel: string;
  dashboardFields: IndustryField[];
}> = {
  ma: {
    label: "M&A Deal",
    description: "Acquisition price discovery",
    detail: "Both sides privately commit to their valuation. FHE reveals only whether a deal exists, never the individual numbers.",
    parties: {
      initiator: "Founder / shareholder. Sets the minimum exit value they will accept.",
      counterparty: "Acquirer. Sets the maximum they are willing to pay for the company.",
    },
    partyALabel: "Minimum acceptable price",
    partyBLabel: "Maximum willing to pay",
    unit: "M",
    placeholder: "e.g. 80",
    titlePlaceholder: "e.g. Acme Corp acquisition",
    descPlaceholder: "e.g. SaaS company, ARR $4M, 40 employees, Series B",
    terms: ["All-cash", "Stock + cash", "Earnout", "Equity swap", "Asset purchase", "Share purchase"],
    resultLabel: "Acquisition Price",
    dashboardFields: [
      { key: "companyName", label: "Company Name", placeholder: "e.g. Acme Corp", type: "text" },
      { key: "arr", label: "Annual Recurring Revenue", placeholder: "e.g. $4M", type: "text" },
      { key: "employees", label: "Employee Count", placeholder: "e.g. 40", type: "number" },
      { key: "stage", label: "Funding Stage", placeholder: "Select stage", type: "select", options: ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Public", "Bootstrapped"] },
    ],
  },
  salary: {
    label: "Salary Negotiation",
    description: "Job offer price discovery",
    detail: "Eliminates the \"name your number first\" dynamic. Neither side is revealed unless the ranges overlap.",
    parties: {
      initiator: "Candidate. Sets the minimum annual salary they will accept.",
      counterparty: "Employer. Sets the maximum budget approved for this role.",
    },
    partyALabel: "Minimum acceptable salary",
    partyBLabel: "Maximum budget",
    unit: "K",
    placeholder: "e.g. 180",
    titlePlaceholder: "e.g. Senior Engineer, Backend",
    descPlaceholder: "e.g. Full-time, NYC or remote, 5 yrs exp, Python/Go",
    terms: ["Base only", "Base + bonus", "Equity included", "Remote", "Part-time", "Contract"],
    resultLabel: "Agreed Compensation",
    dashboardFields: [
      { key: "roleTitle", label: "Role Title", placeholder: "e.g. Senior Backend Engineer", type: "text" },
      { key: "department", label: "Department", placeholder: "e.g. Engineering", type: "text" },
      { key: "location", label: "Location", placeholder: "e.g. NYC / Remote", type: "text" },
      { key: "workModel", label: "Work Model", placeholder: "Select model", type: "select", options: ["Remote", "Hybrid", "On-site"] },
    ],
  },
  realestate: {
    label: "Real Estate",
    description: "Property price discovery",
    detail: "Both parties independently commit without anchoring each other. If ranges overlap, escrow is triggered on-chain automatically.",
    parties: {
      initiator: "Initiator. Sets the minimum price they will accept for the property.",
      counterparty: "Counterparty. Sets the maximum they are willing to offer.",
    },
    partyALabel: "Minimum asking price",
    partyBLabel: "Maximum offer",
    unit: "K",
    placeholder: "e.g. 650",
    titlePlaceholder: "e.g. 14 Oak Street, Brooklyn",
    descPlaceholder: "e.g. 3BR/2BA, 1,400 sqft, gut renovated 2022",
    terms: ["All-cash", "Mortgage", "Contingency", "As-is", "Lease-back", "Inspection waiver"],
    resultLabel: "Agreed Purchase Price",
    dashboardFields: [
      { key: "propertyAddress", label: "Property Address", placeholder: "e.g. 14 Oak Street, Brooklyn", type: "text" },
      { key: "sqft", label: "Square Footage", placeholder: "e.g. 1400", type: "number" },
      { key: "bedBath", label: "Bed / Bath", placeholder: "e.g. 3BR / 2BA", type: "text" },
      { key: "yearBuilt", label: "Year Built", placeholder: "e.g. 2022", type: "number" },
    ],
  },
  custom: {
    label: "Custom Deal",
    description: "Any two-party negotiation",
    detail: "A general-purpose blind negotiation room for licensing, freelance contracts, commodity trades, or any scenario with a floor and a ceiling.",
    parties: {
      initiator: "Party A (you). Sets the minimum value you will accept.",
      counterparty: "Party B. Sets the maximum they are willing to pay.",
    },
    partyALabel: "Your floor price",
    partyBLabel: "Your ceiling price",
    unit: "",
    placeholder: "e.g. 100000",
    titlePlaceholder: "e.g. Software license, annual",
    descPlaceholder: "e.g. B2B SaaS deal, 500 seats, enterprise tier",
    terms: ["Fixed price", "Revenue share", "Milestone-based", "Equity swap", "Installments", "Barter"],
    resultLabel: "Agreed Price",
    dashboardFields: [],
  },
};

/**
 * Generate a random room ID (short display code)
 */
export function generateRoomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Local State Persistence ─────────────────────────────────────
// Rooms are persisted in localStorage for UI state recovery.
// The on-chain contract is the source of truth for room status,
// but localStorage keeps transient UI data like labels and types.

export function saveRoom(room: Room): void {
  localStorage.setItem(`concord_room_${room.id}`, JSON.stringify(room));
  const rooms: string[] = JSON.parse(localStorage.getItem("concord_rooms") || "[]");
  if (!rooms.includes(room.id)) {
    rooms.push(room.id);
    localStorage.setItem("concord_rooms", JSON.stringify(rooms));
  }
}

export function getRoom(id: string): Room | null {
  const raw = localStorage.getItem(`concord_room_${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Room;
  } catch {
    return null;
  }
}

export function getAllRooms(): Room[] {
  const ids: string[] = JSON.parse(localStorage.getItem("concord_rooms") || "[]");
  return ids
    .map(id => getRoom(id))
    .filter((r): r is Room => r !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function updateRoom(id: string, updates: Partial<Room>): void {
  const room = getRoom(id);
  if (room) {
    saveRoom({ ...room, ...updates });
  }
}

// ── Wave 5: Auction Persistence ─────────────────────────────────

export function saveAuction(auction: Auction): void {
  localStorage.setItem(`concord_auction_${auction.id}`, JSON.stringify(auction));
  const auctions: string[] = JSON.parse(localStorage.getItem("concord_auctions") || "[]");
  if (!auctions.includes(auction.id)) {
    auctions.push(auction.id);
    localStorage.setItem("concord_auctions", JSON.stringify(auctions));
  }
}

export function getAuction(id: string): Auction | null {
  const raw = localStorage.getItem(`concord_auction_${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Auction;
  } catch {
    return null;
  }
}

export function getAllAuctions(): Auction[] {
  const ids: string[] = JSON.parse(localStorage.getItem("concord_auctions") || "[]");
  return ids
    .map(id => getAuction(id))
    .filter((a): a is Auction => a !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function updateAuction(id: string, updates: Partial<Auction>): void {
  const auction = getAuction(id);
  if (auction) {
    saveAuction({ ...auction, ...updates });
  }
}

// ── Formatting Helpers ──────────────────────────────────────────

export function formatPrice(value: number, unit: string): string {
  if (!unit) return `$${value.toLocaleString()}`;
  return `$${value}${unit}`;
}

export function shortAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Contract Constants ──────────────────────────────────────────

export const CONCORD_CONTRACT_ADDRESS = "0xEB81D05a54068A662aD7aC62CF1Df91cD5e9DdE6";
export const CONCORD_AUCTION_ADDRESS = "0xE3cfEDb40575412574d1107730ade283237Ab1df";
export const CONCORD_NETWORK = "Base Sepolia";
export const CONCORD_CHAIN_ID = 84532;
export const CONCORD_EXPLORER = "https://sepolia.basescan.org";
