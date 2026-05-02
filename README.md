# Concord — Blind Negotiation Protocol

> **Private price discovery powered by Fully Homomorphic Encryption.**
> Built with [Base](https://base.org) & [Fhenix CoFHE](https://fhenix.io).

Two parties submit encrypted reservation prices on-chain. The smart contract compares them, computes a midpoint — all in encrypted space. Neither party's number is ever revealed. Only the outcome is decrypted.

---

## How It Works

```
Party A: enters floor price → encrypted in browser via CoFHE SDK
                                    ↓
                           on-chain as euint64 (ciphertext)
                                    ↓
Party B: enters ceiling price → encrypted in browser via CoFHE SDK
                                    ↓
                           on-chain as euint64 (ciphertext)
                                    ↓
                    ┌─────────────────────────────┐
                    │   FHE.gte(ceiling, floor)    │  ← Is there a deal?
                    │   FHE.add(floor, ceiling)    │  ← Sum
                    │   FHE.div(sum, 2)            │  ← Midpoint
                    │   FHE.select(match, mid, 0)  │  ← Conditional
                    └─────────────────────────────┘
                                    ↓
                    Result: Deal found at $87.5M
                    (neither $80M floor nor $95M ceiling was revealed)
```

---

## FHE Deep Dive — What Fhenix CoFHE Actually Does

### Client-Side Encryption (Browser)

When a user types "$80M" and clicks submit, the CoFHE SDK runs 5 steps in their browser:

| Step | Operation | Duration | Description |
|------|-----------|----------|-------------|
| 1 | **InitTfhe** | ~2-4s | Downloads TFHE WebAssembly engine (cached after first use) |
| 2 | **FetchKeys** | ~1-2s | Fetches FHE public key from the CoFHE network |
| 3 | **Pack** | <1ms | Packs plaintext into TFHE ciphertext format |
| 4 | **Prove** | ~10-15s | Generates ZK proof that encryption is valid (CPU intensive) |
| 5 | **Verify** | ~1-2s | CoFHE verifier network validates the proof |

After this, the plaintext number **no longer exists**. Only an encrypted blob goes on-chain.

### On-Chain FHE Computation

The smart contract performs arithmetic on encrypted values — without ever decrypting them:

```solidity
// Step 1: Compare two ENCRYPTED numbers
ebool hasMatch = FHE.gte(room.partyBPrice, room.partyAPrice);
// → Answers "Is ceiling >= floor?" while BOTH remain encrypted

// Step 2: Add two ENCRYPTED numbers
euint64 encSum = FHE.add(room.partyAPrice, room.partyBPrice);

// Step 3: Divide ENCRYPTED result
euint64 encMidpoint = FHE.div(encSum, FHE.asEuint64(2));

// Step 4: Conditional select on ENCRYPTED boolean
euint64 encAgreed = FHE.select(hasMatch, encMidpoint, FHE.asEuint64(0));
```

**The EVM computed $87.5M as the agreed price without ever knowing Party A said $80M or Party B said $95M.**

### What's Visible on the Blockchain

| Data | Visible? | Format |
|------|----------|--------|
| Party addresses | ✅ Public | `0x720392Bb...` |
| Party A's price | ❌ **Never** | Stored as `euint64` ciphertext |
| Party B's price | ❌ **Never** | Stored as `euint64` ciphertext |
| Match result | ❌ Encrypted | Stored as `ebool` ciphertext |
| Agreed price | ❌ Encrypted | Stored as `euint64` ciphertext |
| Room status | ✅ Public | Plain enum |

### FHE Operations Used

| Operation | Solidity Call | Purpose |
|-----------|---------------|---------|
| Convert input | `FHE.asEuint64(input)` | Validates ZK proof & stores encrypted value |
| Compare | `FHE.gte(a, b)` | Greater-than-or-equal → encrypted bool |
| Add | `FHE.add(a, b)` | Addition → encrypted sum |
| Divide | `FHE.div(a, b)` | Division → encrypted quotient |
| Conditional | `FHE.select(cond, a, b)` | If-else → encrypted result |
| Access control | `FHE.allow(ct, addr)` | Grant decryption permission |

---

## Smart Contract

### BlindNegotiation.sol

**Network:** Base Sepolia  
**Address:** `0xd7FA8ad77cfAa55674af496088f8D3723F9ff402`

```solidity
contract BlindNegotiation {
    enum RoomStatus { Open, PendingB, Computing, Settled, Expired }

    struct Room {
        address partyAAddress;     // Plaintext address
        address partyBAddress;     // Plaintext address
        euint64 partyAPrice;       // Encrypted floor (never decrypted)
        euint64 partyBPrice;       // Encrypted ceiling (never decrypted)
        ebool   matched;           // FHE comparison result
        euint64 agreedPrice;       // FHE midpoint if matched
        RoomStatus status;
        uint256 createdAt;
        uint256 deadline;
        uint8 negotiationType;
    }

    function createRoom(bytes32 roomId, InEuint64 calldata encFloor,
                        uint8 nType, uint256 deadline) external;

    function sendInvite(bytes32 roomId, address recipient) external;

    function joinAndCompute(bytes32 roomId,
                            InEuint64 calldata encCeiling) external;

    function publishResult(bytes32 roomId, bool _matched,
                           uint64 _agreedPrice) external;
}
```

### Contract Functions

| Function | Called By | What It Does |
|----------|-----------|--------------|
| `createRoom` | Initiator | Stores encrypted floor price, creates room |
| `sendInvite` | Initiator | Sends on-chain invite to counterparty wallet |
| `joinAndCompute` | Counterparty | Stores encrypted ceiling, runs full FHE circuit |
| `publishResult` | Either party | Publishes decrypted result on-chain |
| `getRoomInfo` | Anyone | Returns room state (addresses, status, published result) |
| `getReceivedInvites` | Anyone | Returns invites for a wallet address |

---

## Architecture

### Participants

- **Initiator (Party A):** Sets a minimum acceptable price (floor).
- **Counterparty (Party B):** Sets a maximum willingness to pay (ceiling).

### Deal Condition

A deal exists if `ceiling >= floor`. The agreed price is the midpoint: `(floor + ceiling) / 2`.

### Privacy Guarantee

Neither party learns the other's reservation price under any outcome:

- **No deal:** Each party learns only that no overlap exists.
- **Deal:** Each party learns the agreed midpoint. Individual prices remain encrypted forever.

This property is enforced cryptographically — not by policy or trust.

---

## Tech Stack

### Blockchain & Cryptography

| Technology | Role |
|---|---|
| Fhenix CoFHE | Native FHE operations on Base Sepolia |
| Solidity ^0.8.26 | Smart contract language |
| `@cofhe/sdk` v0.5.2 | Client-side FHE encryption |
| `euint64` / `ebool` | Encrypted integer and boolean types |

### Frontend

| Technology | Role |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool with HMR |
| Framer Motion | Animations |
| Tailwind CSS 4 | Styling |
| wagmi / viem | Contract interaction |
| ConnectKit | Wallet connection |

### Infrastructure

| Technology | Role |
|---|---|
| pnpm workspaces | Monorepo management |
| Foundry | Contract compilation and deployment |
| LocalStorage | Room state persistence + on-chain state |

---

## Supported Negotiation Types

| Type | Initiator (Party A) | Counterparty (Party B) | Unit |
|---|---|---|---|
| M&A Deal | Minimum Acceptable Price | Maximum Willing to Pay | M (millions) |
| Salary | Minimum Acceptable Salary | Maximum Offer | K (thousands) |
| Real Estate | Minimum Sale Price | Maximum Purchase Price | M (millions) |
| Custom Deal | Minimum Acceptable | Maximum Willing to Pay | — |

---

## Application Routes

| Route | Description |
|---|---|
| `/` | Landing page — protocol overview |
| `/role` | Role selection — Initiator or Counterparty |
| `/create` | Initiator flow — set floor price, encrypt, create room |
| `/join` | Counterparty flow — enter room code |
| `/inbox` | On-chain inbox — received and sent invites |
| `/room/:id` | Negotiation room — price submission and FHE computation |
| `/result/:id` | Result page — deal outcome and settlement |
| `/negotiate` | Interactive demo — protocol demonstration |

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

The application runs at `http://localhost:5173`.

### Requirements

- Node.js 18+
- pnpm
- Foundry (for contract compilation/deployment)

---

## Security Properties

- **Input Privacy:** Prices encrypted on-device before any network transmission
- **Computation Integrity:** All arithmetic runs inside Fhenix CoFHE — no trusted intermediary
- **Zero-Knowledge No-Deal:** When no overlap exists, neither party learns any bound
- **Partial Revelation on Deal:** Only the midpoint is revealed; individual prices remain encrypted

---

## License

MIT

*Built with Base & Fhenix CoFHE. Fully homomorphic encryption for private price discovery.*
