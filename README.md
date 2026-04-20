# Concord — Blind Negotiation Protocol

A decentralised application that enables two parties to discover whether they have a deal, and at what price, without either party ever revealing their reservation price. Built on Fhenix Collaborative Fully Homomorphic Encryption (CoFHE) on Base Sepolia.

---

## Overview

Price negotiation presents a fundamental information asymmetry problem: the first party to reveal their number loses leverage. Existing solutions require either a trusted intermediary, a trusted execution environment, or complete opacity — none of which provide verifiable privacy guarantees.

Concord solves this with Fully Homomorphic Encryption. Both parties submit their reservation prices as ciphertexts on-chain. The smart contract performs all comparison and arithmetic operations directly on the encrypted values — neither party's price is ever visible on-chain. Only the outcome (deal or no deal, and if a deal, the midpoint price) is decrypted and revealed.

---

## Core Protocol

### Participants

- **Party A:** holds a minimum acceptable price (floor). Wishes to sell no lower than this value.
- **Party B:** holds a maximum willingness to pay (ceiling). Wishes to buy no higher than this value.

### Deal Condition

A deal exists if and only if `ceiling >= floor`. The agreed price is the midpoint: `(floor + ceiling) / 2`.

### Privacy Guarantee

Neither party learns the other's reservation price under any outcome:

- If no deal: each party learns only that no overlap exists. No bound on the other's number is revealed.
- If deal: each party learns the agreed midpoint. The individual floor and ceiling remain encrypted.

This property is enforced cryptographically by the FHE circuit — not by policy or trust.

---

## Architecture

### On-Chain Components

| Component | Network | Address |
|---|---|---|
| `BlindNegotiation.sol` | Base Sepolia | `0xd7FA8ad77cfAa55674af496088f8D3723F9ff402` |
| Fhenix CoFHE Coprocessor | Base Sepolia | Provides `asEuint64`, `gte`, `add`, `div`, `select` |

### FHE Computation

The core blind comparison runs entirely inside the Fhenix CoFHE runtime:

```solidity
euint64 encFloor   = FHE.asEuint64(partyA_ciphertext);
euint64 encCeiling = FHE.asEuint64(partyB_ciphertext);

ebool   hasMatch = FHE.gte(encCeiling, encFloor);
euint64 sum      = FHE.add(encFloor, encCeiling);
euint64 mid      = FHE.div(sum, 2);
euint64 result   = FHE.select(hasMatch, mid, FHE.asEuint64(0));

FHE.allow(result, partyAAddress);
FHE.allow(result, partyBAddress);
```

### On-Chain Invite System

Concord uses a **fully on-chain invite system** — no external messaging services (XMTP, email, etc.) are needed:

1. Seller creates a room and submits their encrypted floor price.
2. Seller sends an on-chain invite to the buyer's wallet address via `sendInvite()`.
3. The buyer's frontend polls `getReceivedInviteCount()` and displays a notification badge.
4. The buyer opens their Inbox, sees all received invites, and joins the room directly.

All invites are stored on-chain and tied to wallet addresses.

---

## Tech Stack

### Blockchain & Cryptography

| Technology | Role |
|---|---|
| Fhenix CoFHE | Native FHE operations for encrypted arithmetic on Base Sepolia |
| Solidity ^0.8.26 | Smart contract language |
| `@cofhe/sdk` | Client-side FHE encryption and decryption |
| `euint64` / `ebool` | Encrypted integer and boolean types for all price operations |

### Frontend

| Technology | Role |
|---|---|
| React 18 + TypeScript | UI framework and type safety |
| Vite | Build tool and HMR |
| Framer Motion | Animations and transitions |
| Tailwind CSS 4 | Styling |
| Wouter | Client-side routing |
| wagmi / viem | Contract interaction and typed ABI encoding |
| ConnectKit | Wallet connection |
| Lucide React | Icon set |

### Infrastructure

| Technology | Role |
|---|---|
| pnpm workspaces | Monorepo management |
| Foundry | Contract compilation and deployment |
| Vercel | Frontend deployment |
| LocalStorage | Room state persistence (supplemented by on-chain state) |

---

## Application Routes

| Route | Description |
|---|---|
| `/` | Landing page — protocol overview |
| `/role` | Role selection — Seller or Buyer |
| `/create` | Seller flow — set floor price, encrypt, send on-chain invite |
| `/join` | Buyer flow — enter room code |
| `/inbox` | On-chain inbox — view received and sent invites |
| `/room/:id` | Negotiation room — price submission and FHE computation |
| `/result/:id` | Result page — deal outcome and settlement |
| `/negotiate` | Interactive demo — auto-play protocol demonstration |

---

## User Flow

### Seller

1. Navigate to `/role`, select **Seller**.
2. On `/create`: choose negotiation type, enter identity, set deadline, and enter minimum acceptable price.
3. The price is encrypted client-side via the Fhenix FHE SDK. The plaintext never leaves the device.
4. Submit the ciphertext on-chain. A room code is generated from the room ID.
5. Send an **on-chain invite** to the buyer's wallet address — no external apps needed.
6. Wait in `/room/:id` for the buyer to join. The room polls the blockchain every 8 seconds for real-time updates.

### Buyer

1. Check the **Inbox** (notification badge appears in the navbar when new invites arrive).
2. Open the invite and join the room directly.
3. The room shows that Party A has sealed their floor price (visible only as an encrypted ciphertext).
4. Enter maximum willingness to pay. The value is encrypted locally before submission.
5. Submit the ciphertext on-chain. The FHE computation executes automatically.
6. Both parties see the result simultaneously.

### Settlement Layer (ReineiraOS)

Once a deal is reached, Concord integrates with **ReineiraOS** to handle confidential escrows. The agreed price remains encrypted on-chain via FHE. The Concord protocol interacts with the ReineiraOS SDK to:
1. Create a `ConfidentialEscrow` for the deal.
2. Fund the escrow by depositing USDC (which is wrapped into ConfidentialUSDC).
3. Ensure the seller can redeem the escrow upon successful completion, while the transaction amounts remain completely confidential.

---

## Security Properties

- **Input confidentiality:** Prices are encrypted on the client device before any network transmission. Plaintext values never appear in calldata or contract storage.
- **Computation integrity:** All arithmetic runs inside Fhenix CoFHE. No trusted intermediary is involved.
- **Zero-knowledge no-deal:** When no overlap exists, neither party learns any bound on the other's number.
- **Partial revelation on deal:** The midpoint is revealed to both parties. Individual prices remain encrypted.

---

## Supported Negotiation Types

| Type | Party A | Party B | Unit |
|---|---|---|---|
| M&A Deal | Minimum Acceptable Price | Maximum Willing to Pay | M (millions) |
| Salary Negotiation | Minimum Acceptable Salary | Maximum Offer | K (thousands) |
| Real Estate | Minimum Sale Price | Maximum Purchase Price | M (millions) |
| Custom Deal | Minimum Acceptable | Maximum Willing to Pay | — |

---

## Local Development

```bash
# Install dependencies
pnpm install

# Start the frontend
pnpm --filter @workspace/concord run dev

# Build for production
pnpm --filter @workspace/concord run build

# Compile contracts (requires Foundry)
cd contracts && forge build
```

The application runs at `http://localhost:5173` by default.

### Requirements

- Node.js 18+
- pnpm
- Foundry (for contract compilation/deployment)

### Deployment

```bash
# Deploy to Vercel
vercel --prod
```

The `vercel.json` in the project root handles SPA routing and WASM content-type headers.

---

## License

MIT
