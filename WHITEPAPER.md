# Concord — Blind Negotiation Protocol
## Technical Whitepaper

**Version:** 3.0.0  
**Date:** May 2026  
**Network:** Base Sepolia (Fhenix CoFHE coprocessor)  
**Contract:** `0x46BC52321a0B3C886Fccc2db88142727E44D3B7D`  
**Built with:** Base & Fhenix CoFHE

---

## Abstract

Concord is a fully homomorphic encryption (FHE) powered blind negotiation protocol that enables two counterparties to discover whether a deal exists — and at what price — without either party revealing their private reservation price. Using Fhenix CoFHE as the computation layer on Base Sepolia, all price data remains encrypted throughout the entire negotiation lifecycle. The protocol is fully trustless: no external messaging services, oracles, or intermediaries are required.

---

## 1. Problem Statement

Traditional negotiation protocols require one or both parties to reveal their reservation price before determining whether terms overlap. This creates fundamental information asymmetries:

- **The Anchoring Problem**: The first party to name a price anchors the entire negotiation, disadvantaging them.
- **Strategic Revelation**: Knowing the counterparty's floor or ceiling enables exploitative counter-offers.
- **Trust Dependency**: Intermediaries who facilitate blind auctions must be unconditionally trusted with price data.
- **Protocol Leakage**: Even "sealed bid" systems on conventional blockchains expose data to node operators, MEV searchers, and on-chain observers.

Concord eliminates all of these through cryptographic guarantees enforced at the virtual machine level.

---

## 2. Cryptographic Foundation

### 2.1 Fully Homomorphic Encryption (FHE)

Concord uses **Fhenix CoFHE**, a Solidity/EVM-compatible FHE coprocessor built on the TFHE library. FHE allows computations to be performed directly on encrypted data without decrypting it.

**Core property:**

```
Encrypt(A) OP Encrypt(B) → Encrypt(A OP B)
```

For Concord, the critical operations are comparison, addition, division, and conditional selection:

```solidity
euint64 floorEnc  = FHE.asEuint64(initiatorEncryptedInput);
euint64 ceilEnc   = FHE.asEuint64(counterpartyEncryptedInput);

ebool   hasMatch  = FHE.gte(ceilEnc, floorEnc);      // ceiling >= floor?
euint64 sum       = FHE.add(floorEnc, ceilEnc);       // sum in ciphertext
euint64 mid       = FHE.div(sum, FHE.asEuint64(2));   // midpoint in ciphertext
euint64 agreed    = FHE.select(hasMatch, mid, FHE.asEuint64(0)); // conditional
```

**What is never revealed:**
- The initiator's floor price
- The counterparty's ceiling price
- The margin between prices
- Any intermediate computation result

**What is revealed (only after threshold decryption):**
- Whether `ceiling >= floor` (the match bit)
- The midpoint price if matched

### 2.2 FHE Type System

| FHE Type  | Plaintext Equivalent | Bit Width |
|-----------|---------------------|-----------|
| `euint64` | `uint64`            | 64        |
| `ebool`   | `bool`              | 1         |

Concord uses `euint64` for all price representation, supporting values up to 1.84 × 10¹⁹.

### 2.3 Client-Side Encryption Pipeline

Prices are encrypted entirely on the user's device via the `@cofhe/sdk` (v0.5.2). The encryption runs 5 stages:

| Stage | Operation | Duration | Description |
|-------|-----------|----------|-------------|
| 1 | **InitTfhe** | ~2-4s | Downloads TFHE WebAssembly engine (cached after first use) |
| 2 | **FetchKeys** | ~1-2s | Fetches the FHE public key from the CoFHE threshold network |
| 3 | **Pack** | <1ms | Packs the plaintext number into TFHE ciphertext format |
| 4 | **Prove** | ~10-15s | Generates a ZK proof that the encryption is valid (CPU intensive) |
| 5 | **Verify** | ~1-2s | CoFHE verifier network validates the proof and signs it |

**Total time:** ~15-25 seconds (first run); ~12-18 seconds (subsequent, WASM cached).

The output is an `InEuint64` structure containing `{ctHash, securityZone, utype, signature}`, which is submitted as transaction calldata. The plaintext number never appears in any network transmission.

### 2.4 Without FHE vs With FHE

#### Without FHE (conventional smart contract)
```solidity
uint64 partyAPrice = 80000000; // ← Visible on-chain to everyone
uint64 partyBPrice = 95000000; // ← Visible on-chain to everyone
bool matched = partyBPrice >= partyAPrice; // Everyone sees true
uint64 agreed = (partyAPrice + partyBPrice) / 2; // Everyone sees $87.5M
```
**Problem**: Any blockchain explorer shows both prices. Party B knows Party A would accept $80M.

#### With Fhenix CoFHE (this contract)
```solidity
euint64 partyAPrice = FHE.asEuint64(encFloor);  // Encrypted blob
euint64 partyBPrice = FHE.asEuint64(encCeiling); // Encrypted blob
ebool matched = FHE.gte(partyBPrice, partyAPrice); // Encrypted boolean
euint64 agreed = FHE.select(matched, midpoint, FHE.asEuint64(0)); // Encrypted result
```
**Result**: Same computation, same answer — but **zero information leaked**.

---

## 3. Smart Contract Architecture

### 3.1 BlindNegotiation.sol

Deployed at `0x46BC52321a0B3C886Fccc2db88142727E44D3B7D` on Base Sepolia.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract BlindNegotiation {

    enum RoomStatus { Open, PendingB, Computing, Settled, Expired }

    struct Room {
        address partyAAddress;     // Plaintext address of Initiator
        address partyBAddress;     // Plaintext address of Counterparty
        euint64 partyAPrice;       // Encrypted floor (never decrypted on-chain)
        euint64 partyBPrice;       // Encrypted ceiling (never decrypted on-chain)
        ebool   matched;           // FHE comparison result (encrypted boolean)
        euint64 agreedPrice;       // FHE midpoint if matched (encrypted)
        RoomStatus status;
        uint256 createdAt;
        uint256 deadline;
        uint8 negotiationType;     // 0=M&A, 1=Salary, 2=RealEstate, 3=Custom
    }

    struct Invite {
        bytes32 roomId;
        address sender;
        uint256 timestamp;
        uint8 negotiationType;
    }
}
```

### 3.2 Contract Functions — Detailed Breakdown

#### `createRoom(bytes32 roomId, InEuint64 calldata encFloor, uint8 nType, uint256 deadline)`

Called by the **Initiator** (Party A) to create a negotiation room.

1. Validates room doesn't exist, deadline is in the future, negotiation type is valid
2. Calls `FHE.asEuint64(encFloor)` — validates the ZK proof from the client SDK and converts the encrypted input into an on-chain FHE ciphertext handle
3. Calls `FHE.allowSender(room.partyAPrice)` — grants the sender permission to decrypt this value later
4. Calls `FHE.allowThis(room.partyAPrice)` — grants the contract permission to use this value in FHE operations
5. Sets room status to `PendingB`

**What's stored on-chain:** The `euint64` is a ciphertext handle — a reference to encrypted data managed by the CoFHE coprocessor. If you inspect the blockchain, you see something like `0xa3f7c2d8e1...` — completely meaningless without the FHE secret key (which is split across the Threshold Network and held by nobody individually).

#### `sendInvite(bytes32 roomId, address recipient)`

Fully on-chain invite system. The initiator sends an invite to the counterparty's wallet address. The invite is stored in `receivedInvites[recipient]` and `sentInvites[sender]` mappings. No XMTP, email, or external services required.

#### `joinAndCompute(bytes32 roomId, InEuint64 calldata encCeiling)`

Called by the **Counterparty** (Party B). This is where the FHE magic happens:

```solidity
// Store Party B's encrypted ceiling
room.partyBPrice = FHE.asEuint64(encCeiling);

// ── CORE FHE COMPUTATION ──────────────────────────
// Step 1: Is there a deal? (ceiling >= floor)
// Both operands are encrypted. The RESULT is also encrypted.
ebool hasMatch = FHE.gte(room.partyBPrice, room.partyAPrice);

// Step 2: Compute midpoint in encrypted space
// 80M + 95M = 175M, but ALL numbers remain ciphertext
euint64 encSum = FHE.add(room.partyAPrice, room.partyBPrice);
euint64 encMidpoint = FHE.div(encSum, FHE.asEuint64(2));

// Step 3: Conditional — midpoint only if match, else encrypted zero
// Even the BRANCH DECISION is encrypted
euint64 encAgreed = FHE.select(hasMatch, encMidpoint, FHE.asEuint64(0));
// ──────────────────────────────────────────────────

// Grant both parties access to decrypt the results
FHE.allow(room.matched, room.partyAAddress);
FHE.allow(room.matched, room.partyBAddress);
FHE.allow(room.agreedPrice, room.partyAAddress);
FHE.allow(room.agreedPrice, room.partyBAddress);
```

**Critical insight:** The EVM executed `>=`, `+`, `/`, and `if/else` on two numbers it **never saw**. At no point during execution does the contract, the node operator, or any observer have access to the plaintext values.

#### `publishResult(bytes32 roomId, bool _matched, uint64 _agreedPrice)`

After threshold decryption (off-chain via CoFHE SDK), either party can publish the decrypted result on-chain for permanent storage.

#### `getEncryptedResult(bytes32 roomId)`

Returns the FHE ciphertext handles (`euint64 encAgreedPrice`, `ebool encMatched`) for client-side decryption via the CoFHE SDK's `decryptForView()` API. Only callable by room parties (`onlyParty` modifier).

### 3.3 On-Chain Invite System

| Step | Action | On-Chain Function |
|------|--------|-------------------|
| 1 | Initiator creates room | `createRoom()` |
| 2 | Initiator invites counterparty | `sendInvite(roomId, address)` |
| 3 | Counterparty's frontend polls | `getReceivedInviteCount(address)` |
| 4 | Counterparty opens inbox | `getReceivedInvites(address)` |
| 5 | Counterparty joins and computes | `joinAndCompute(roomId, encCeiling)` |

---

## 4. Protocol Lifecycle

```
┌───────────────┬─────────────────────────────────────────────────────┐
│    Phase      │  Description                                        │
├───────────────┼─────────────────────────────────────────────────────┤
│  1. Room      │  Initiator creates room, submits enc(floor) to      │
│  Creation     │  BlindNegotiation on Base Sepolia.                   │
├───────────────┼─────────────────────────────────────────────────────┤
│  2. Invite    │  Initiator sends on-chain invite to counterparty's   │
│               │  wallet address via sendInvite().                    │
│               │  No external messaging required.                     │
├───────────────┼─────────────────────────────────────────────────────┤
│  3. Counter-  │  Counterparty sees invite in their on-chain Inbox,   │
│  party Submit │  joins room, submits enc(ceiling).                   │
├───────────────┼─────────────────────────────────────────────────────┤
│  4. FHE       │  joinAndCompute() executes the full FHE circuit:     │
│  Computation  │  gte → add → div → select.                          │
│               │  Results stored as encrypted values on-chain.        │
├───────────────┼─────────────────────────────────────────────────────┤
│  5. Result    │  On-chain status set to Settled. Both parties can    │
│               │  view the result via the Concord frontend.           │
└───────────────┴─────────────────────────────────────────────────────┘
```

---

## 5. Data Flow

```
USER DEVICE (Browser)
┌──────────────────────────────────────────────────────────────┐
│  plaintext_price → @cofhe/sdk encryptInputs()                │
│                          │                                    │
│    5 steps: InitTfhe → FetchKeys → Pack → Prove → Verify     │
│                          │                                    │
│                   InEuint64 {ctHash, securityZone, sig}       │
└──────────────────────────┼───────────────────────────────────┘
                           │ signed tx (calldata = ciphertext)
                           ▼
BASE SEPOLIA (CoFHE Coprocessor)
┌──────────────────────────────────────────────────────────────┐
│  BlindNegotiation.createRoom(encFloor)                        │
│   └─► FHE.asEuint64() validates ZK proof                     │
│   └─► stores euint64 partyAPrice (never decrypted)           │
│                                                               │
│  BlindNegotiation.sendInvite(roomId, counterpartyAddress)     │
│   └─► stores invite on-chain for counterparty                │
│                                                               │
│  BlindNegotiation.joinAndCompute(encCeiling)                  │
│   └─► FHE.gte(ceiling, floor) → ebool matched                │
│   └─► FHE.add + FHE.div → euint64 midpoint                   │
│   └─► FHE.select(matched, mid, 0) → euint64 result           │
│   └─► FHE.allow(result, partyA) + FHE.allow(result, partyB)  │
│                                                               │
│  Status: Settled — FHE comparison complete                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Security Model

### 6.1 Threat Model

| Threat Actor          | Attack Vector                   | Mitigation                                       |
|-----------------------|---------------------------------|--------------------------------------------------|
| On-chain observer     | Read transaction calldata        | Calldata is FHE ciphertext; unreadable           |
| Malicious node        | Access EVM state                 | euint64 state is encrypted; no plaintext stored  |
| MEV searcher          | Front-run submission             | Price data is ciphertext; ordering doesn't help  |
| Colluding counterparty| Share ciphertext with decryptor  | Threshold decryption requires network quorum     |

### 6.2 Security Properties

- **Input Privacy**: Neither party's price is revealed at any computational step
- **Correctness**: FHE comparison is cryptographically sound — the result cannot be forged
- **Fairness**: Both submissions must be received before comparison
- **Deadline Enforcement**: Room expiry is enforced on-chain
- **Invite Privacy**: Invites contain only room IDs and wallet addresses — no price data
- **Access Control**: `FHE.allow()` ensures only authorized parties can decrypt specific ciphertext handles

---

## 7. Protocol Variants

| Type            | Initiator (Party A)     | Counterparty (Party B)       | Unit        |
|-----------------|-------------------------|------------------------------|-------------|
| M&A Deal        | Floor (min exit)        | Ceiling (max acquisition)    | USD millions|
| Salary          | Floor (min salary)      | Ceiling (max budget)         | USD annual  |
| Real Estate     | Floor (min ask)         | Ceiling (max bid)            | USD         |
| Custom Deal     | Floor (custom)          | Ceiling (custom)             | Custom      |

The FHE logic is identical across all types — only metadata and UX framing differ.

---

## 8. Frontend Architecture

```
artifacts/concord/src/
├── pages/
│   ├── LandingPage.tsx      # Protocol overview and entry point
│   ├── RoleSelectPage.tsx   # Initiator vs Counterparty selection
│   ├── CreateRoom.tsx       # Initiator: set floor, encrypt, create room
│   ├── JoinRoom.tsx         # Counterparty: enter room code
│   ├── InboxPage.tsx        # On-chain invite inbox
│   ├── RoomPage.tsx         # Live negotiation room with on-chain polling
│   ├── ResultPage.tsx       # Deal/no-deal outcome + settlement
│   ├── NegotiatePage.tsx    # Interactive protocol demo
│   └── ContractPage.tsx     # Contract explorer and verification
├── components/
│   ├── NavBar.tsx           # Navigation + wallet state + invite badges
│   ├── WalletModal.tsx      # MetaMask / OKX / Rabby connector
│   ├── FHEBadge.tsx         # Encryption status badge
│   └── ParticleBackground.tsx  # Ambient visual effect
└── lib/
    ├── contracts.ts         # ABI, addresses, room ID utilities
    ├── concord.ts           # Room state, negotiation types, localStorage
    ├── fhe.ts               # CoFHE SDK wrapper (encrypt, decrypt, permits)
    └── wagmi-config.ts      # Wallet connectors and chain config
```

### Design System

Apple Human Interface Guidelines for dark-mode web:

- **Background**: `#000000` (pure black)
- **Surface**: `#1c1c1e` / `#2c2c2e`
- **Accent**: `#0a84ff` (iOS blue)
- **Success**: `#30d158` (iOS green)
- **Danger**: `#ff453a` (iOS red)
- **Typography**: SF Pro / Inter system font stack
- **Glass**: `backdrop-filter: saturate(180%) blur(20px)` for overlays
- **Responsive**: Fully mobile-responsive from 320px to 4K

---

## 9. Formal Definition

Let:
- `p_A ∈ ℕ` = Initiator's reservation price (private)
- `p_B ∈ ℕ` = Counterparty's reservation price (private)
- `E(x)` = FHE encryption under Fhenix network public key
- `D(c)` = Threshold decryption by Fhenix network

**Protocol:**

```
1. Initiator submits: C_A = E(p_A)
2. Initiator invites Counterparty on-chain: sendInvite(roomId, addressB)
3. Counterparty submits: C_B = E(p_B)
4. Contract computes homomorphically:
   a. C_match  = FHE.gte(C_B, C_A)
   b. C_sum    = FHE.add(C_A, C_B)
   c. C_mid    = FHE.div(C_sum, E(2))
   d. C_result = FHE.select(C_match, C_mid, E(0))
5. Status → Settled. FHE comparison complete on-chain.
```

**Privacy guarantee:**
For any PPT adversary observing `C_A`, `C_B`, and `(match, price)`, the adversary cannot distinguish `(p_A, p_B)` from any other pair `(p_A', p_B')` satisfying `[p_A ≤ p_B] = [p_A' ≤ p_B']` and `(p_A + p_B)/2 = (p_A' + p_B')/2`, assuming IND-CPA security of the underlying TFHE scheme.

---

*Concord is open-source software released under the MIT License.*

*Built with Base & Fhenix CoFHE. Fully homomorphic encryption for private price discovery.*
