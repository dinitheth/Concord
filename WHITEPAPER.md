# Concord — Blind Negotiation Protocol
## Technical Whitepaper

**Version:** 2.0.0  
**Date:** April 2026  
**Network:** Base Sepolia (Fhenix CoFHE coprocessor)  
**Contract:** `0xd7FA8ad77cfAa55674af496088f8D3723F9ff402`  
**Buildathon:** Private By Design dApp Buildathon — Akindo / WaveHack

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
euint64 floorEnc  = FHE.asEuint64(sellerEncryptedInput);
euint64 ceilEnc   = FHE.asEuint64(buyerEncryptedInput);

ebool   hasMatch  = FHE.gte(ceilEnc, floorEnc);      // ceiling >= floor?
euint64 sum       = FHE.add(floorEnc, ceilEnc);       // sum in ciphertext
euint64 mid       = FHE.div(sum, FHE.asEuint64(2));   // midpoint in ciphertext
euint64 agreed    = FHE.select(hasMatch, mid, FHE.asEuint64(0)); // conditional
```

**What is never revealed:**
- The seller's floor price
- The buyer's ceiling price
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

### 2.3 Client-Side Encryption

Prices are encrypted entirely on the user's device:

1. User enters price in the browser
2. Encrypted locally via `@cofhe/sdk` using the CoFHE network's public key
3. Serialized as an `InEuint64` containing `ctHash`, `securityZone`, `utype`, and `signature`
4. Submitted as transaction calldata on Base Sepolia

**No server, no relay, no intermediary ever sees the plaintext.**

---

## 3. Protocol Architecture

### 3.1 Protocol Lifecycle

```
┌───────────────┬────────────────────────────────────────────────┐
│    Phase      │  Description                                    │
├───────────────┼────────────────────────────────────────────────┤
│  1. Room      │  Seller creates room, submits enc(floor) to    │
│  Creation     │  BlindNegotiation on Base Sepolia.              │
├───────────────┼────────────────────────────────────────────────┤
│  2. Invite    │  Seller sends on-chain invite to buyer's        │
│               │  wallet address via sendInvite().               │
│               │  No external messaging required.                │
├───────────────┼────────────────────────────────────────────────┤
│  3. Buyer     │  Buyer sees invite in their on-chain Inbox,     │
│  Submission   │  joins room, submits enc(ceiling).              │
├───────────────┼────────────────────────────────────────────────┤
│  4. FHE       │  joinAndCompute() executes the full FHE        │
│  Computation  │  circuit: gte → add → div → select.            │
│               │  Results stored as encrypted values.            │
├───────────────┼────────────────────────────────────────────────┤
│  5. Reveal    │  Threshold decryption reveals only the         │
│               │  match bit and midpoint price.                  │
├───────────────┼────────────────────────────────────────────────┤
│  6. Settlement│  Optional: ConfidentialEscrow locks the        │
│               │  agreed amount in encrypted escrow.             │
└───────────────┴────────────────────────────────────────────────┘
```

### 3.2 Smart Contract

#### BlindNegotiation.sol (Base Sepolia)

Deployed at `0xd7FA8ad77cfAa55674af496088f8D3723F9ff402`.

```solidity
contract BlindNegotiation {
    enum RoomStatus { Open, PendingB, Computing, Settled, Expired }

    struct Room {
        address partyAAddress;
        address partyBAddress;
        euint64 partyAPrice;     // encrypted floor
        euint64 partyBPrice;     // encrypted ceiling
        ebool   matched;         // FHE comparison result
        euint64 agreedPrice;     // FHE midpoint if matched
        RoomStatus status;
        uint256 createdAt;
        uint256 deadline;
        uint8 negotiationType;
    }

    // On-chain invite system
    struct Invite {
        bytes32 roomId;
        address sender;
        uint256 timestamp;
        uint8 negotiationType;
    }

    // Core functions
    function createRoom(bytes32 roomId, InEuint64 calldata encFloor,
                        uint8 nType, uint256 deadline) external;

    function sendInvite(bytes32 roomId, address recipient) external;

    function joinAndCompute(bytes32 roomId,
                            InEuint64 calldata encCeiling) external;

    function publishResult(bytes32 roomId, bool _matched,
                           uint64 _agreedPrice) external;

    // View functions
    function getRoomInfo(bytes32 roomId) external view returns (
        address partyA, address partyB, RoomStatus status,
        uint256 createdAt, uint256 deadline, uint8 negotiationType,
        bool isResultPublished, bool matched, uint64 agreedPrice
    );

    function getReceivedInvites(address) external view returns (Invite[] memory);
    function getReceivedInviteCount(address) external view returns (uint256);
}
```

### 3.3 On-Chain Invite System

Concord uses a fully on-chain invite system — no XMTP, email, or external services required:

| Step | Action | On-Chain Function |
|------|--------|-------------------|
| 1 | Seller creates room | `createRoom()` |
| 2 | Seller invites buyer by wallet address | `sendInvite(roomId, buyerAddress)` |
| 3 | Buyer's frontend polls for new invites | `getReceivedInviteCount(address)` |
| 4 | Buyer opens inbox and sees all invites | `getReceivedInvites(address)` |
| 5 | Buyer joins room and submits ceiling | `joinAndCompute(roomId, encCeiling)` |

Invites are stored in mappings: `receivedInvites[address]` and `sentInvites[address]`.

---

## 4. Data Flow

```
USER DEVICE (Browser)
┌────────────────────────────────────────────────────────────┐
│  plaintext_price ─► @cofhe/sdk encryptInputs()            │
│                          │                                │
│                   InEuint64 {ctHash, securityZone, sig}   │
└──────────────────────────┼────────────────────────────────┘
                           │ signed tx (calldata = ciphertext)
                           ▼
BASE SEPOLIA (CoFHE Coprocessor)
┌────────────────────────────────────────────────────────────┐
│  BlindNegotiation.createRoom(encFloor)                     │
│   └─► stores euint64 partyAPrice (never decrypted)        │
│                                                            │
│  BlindNegotiation.sendInvite(roomId, buyerAddress)         │
│   └─► stores invite on-chain for buyer                    │
│                                                            │
│  BlindNegotiation.joinAndCompute(encCeiling)               │
│   └─► FHE.gte(ceiling, floor) ─► ebool matched            │
│   └─► FHE.add + FHE.div ─► euint64 midpoint               │
│   └─► FHE.select(matched, mid, 0) ─► euint64 result       │
│                                                            │
│  Threshold decryption ─► match bit + agreed price          │
└────────────────────────────────────────────────────────────┘
```

---

## 5. Security Model

### 5.1 Threat Model

| Threat Actor          | Attack Vector                   | Mitigation                                       |
|-----------------------|---------------------------------|--------------------------------------------------|
| On-chain observer     | Read transaction calldata        | Calldata is FHE ciphertext; unreadable           |
| Malicious node        | Access EVM state                 | euint64 state is encrypted; no plaintext stored  |
| MEV searcher          | Front-run submission             | Price data is ciphertext; ordering doesn't help  |
| Colluding counterparty| Share ciphertext with decryptor  | Threshold decryption requires network quorum     |

### 5.2 Security Properties

- **Input Privacy**: Neither party's price is revealed at any computational step
- **Correctness**: FHE comparison is cryptographically sound — the result cannot be forged
- **Fairness**: Both submissions must be received before comparison
- **Deadline Enforcement**: Room expiry is enforced on-chain
- **Invite Privacy**: Invites contain only room IDs and wallet addresses — no price data

---

## 6. Protocol Variants

| Type            | Party A               | Party B                    | Unit        |
|-----------------|-----------------------|----------------------------|-------------|
| M&A Deal        | Floor (min exit)      | Ceiling (max acquisition)  | USD millions|
| Salary          | Floor (min salary)    | Ceiling (max budget)       | USD annual  |
| Real Estate     | Floor (min ask)       | Ceiling (max bid)          | USD         |
| Custom Deal     | Floor (custom)        | Ceiling (custom)           | Custom      |

The FHE logic is identical across all types — only metadata and UX framing differ.

---

## 7. Frontend Architecture

```
artifacts/concord/src/
├── pages/
│   ├── LandingPage.tsx    # Protocol overview and entry point
│   ├── RoleSelectPage.tsx # Seller vs Buyer selection
│   ├── CreateRoom.tsx     # Seller: set floor, encrypt, send invite
│   ├── JoinRoom.tsx       # Buyer: enter room code
│   ├── InboxPage.tsx      # On-chain invite inbox (received/sent)
│   ├── RoomPage.tsx       # Live negotiation room with on-chain polling
│   ├── ResultPage.tsx     # Deal/no-deal outcome + settlement
│   └── NegotiatePage.tsx  # Interactive protocol demo
├── components/
│   ├── NavBar.tsx         # Navigation + wallet state + invite notifications
│   ├── WalletModal.tsx    # MetaMask / OKX / Rabby connector
│   ├── FHEBadge.tsx       # Encryption status badge
│   └── ParticleBackground.tsx  # Ambient visual effect
└── lib/
    ├── contracts.ts       # ABI, addresses, room ID utilities
    ├── concord.ts         # Room state, negotiation types, localStorage
    ├── fhe.ts             # FHE encryption wrapper (@cofhe/sdk)
    └── wagmi-config.ts    # Wallet connectors and chain config
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

---

## 8. Roadmap

### Phase 1 — Buildathon (Current)
- [x] Full FHE UI flow with CoFHE integration
- [x] On-chain room creation and invite system
- [x] Real-time seller/buyer state synchronization via blockchain polling
- [x] Apple dark design system
- [x] Wallet connection (MetaMask, OKX, Rabby)
- [x] On-chain inbox with notification badges

### Phase 2 — Production
- [ ] Full threshold decryption integration
- [ ] ConfidentialEscrow settlement
- [ ] Gas optimization and batched operations
- [ ] Multi-asset settlement (ETH, ERC-20)

### Phase 3 — Scale
- [ ] Security audit
- [ ] IPFS frontend deployment
- [ ] ENS integration for counterparty addressing
- [ ] SDK for third-party integration

---

## 9. Formal Definition

Let:
- `p_A ∈ ℕ` = Seller's reservation price (private)
- `p_B ∈ ℕ` = Buyer's reservation price (private)
- `E(x)` = FHE encryption under Fhenix network public key
- `D(c)` = Threshold decryption by Fhenix network

**Protocol:**

```
1. Party A submits: C_A = E(p_A)
2. Seller invites Party B on-chain: sendInvite(roomId, addressB)
3. Party B submits: C_B = E(p_B)
4. Contract computes homomorphically:
   a. C_match = FHE.gte(C_B, C_A)
   b. C_sum   = FHE.add(C_A, C_B)
   c. C_mid   = FHE.div(C_sum, E(2))
   d. C_result = FHE.select(C_match, C_mid, E(0))
5. Threshold decrypt: match = D(C_match), price = D(C_result)
```

**Privacy guarantee:**
For any PPT adversary observing `C_A`, `C_B`, and `(match, price)`, the adversary cannot distinguish `(p_A, p_B)` from any other pair `(p_A', p_B')` satisfying `[p_A ≤ p_B] = [p_A' ≤ p_B']` and `(p_A + p_B)/2 = (p_A' + p_B')/2`, assuming IND-CPA security of the underlying TFHE scheme.

---

*Concord is open-source software released under the MIT License.*

*Built for the Private By Design dApp Buildathon — Akindo / WaveHack, 2026.*
