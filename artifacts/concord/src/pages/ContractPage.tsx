import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Code2, ExternalLink, Shield, Zap } from "lucide-react";
import NavBar from "@/components/NavBar";
import FHEBadge from "@/components/FHEBadge";

const FULL_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";
import "@fhenixprotocol/cofhe-contracts/access/Permissioned.sol";

/**
 * @title BlindNegotiation
 * @notice Concord's core contract — blind price discovery using Fhenix CoFHE.
 * @dev Two parties submit encrypted prices. FHE.gte() determines match.
 *      Neither party's price is ever visible on-chain. Only the result
 *      (match/no-match + encrypted midpoint) is decryptable by both parties.
 *
 *      Network: Base Sepolia (CoFHE Testnet)
 *      Deployed: 0x28c80aDC6404ede43C6127BfA2F3c39A7A9b4569
 *      ReineiraOS Escrow: 0xC4333F84F5034D8691CB95f068def2e3B6DC60Fa
 */
contract BlindNegotiation is Permissioned {

    enum RoomStatus { Open, PendingB, Computing, Settled }

    struct Room {
        euint64 partyAPrice;     // Encrypted floor (Party A — creator)
        euint64 partyBPrice;     // Encrypted ceiling (Party B — joiner)
        eaddress partyA;         // Encrypted address of Party A
        eaddress partyB;         // Encrypted address of Party B
        ebool matched;           // FHE comparison: B.ceiling >= A.floor
        euint64 agreedPrice;     // FHE midpoint if matched (otherwise 0)
        RoomStatus status;
        uint256 createdAt;
        uint8 negotiationType;   // 0=M&A, 1=Salary, 2=RealEstate, 3=Custom
    }

    mapping(bytes32 => Room) private rooms;
    bytes32[] public roomIds;

    event RoomCreated(bytes32 indexed roomId, uint8 nType, uint256 timestamp);
    event RoomJoined(bytes32 indexed roomId, uint256 timestamp);
    event MatchComputed(bytes32 indexed roomId, uint256 timestamp);

    /**
     * @notice Party A creates a room with their encrypted floor price.
     * @param roomId    Unique room identifier (bytes32)
     * @param encFloor  InEuint64 — encrypted floor price with ZKPoK
     * @param nType     Negotiation type (0=M&A, 1=Salary, etc.)
     */
    function createRoom(
        bytes32 roomId,
        InEuint64 calldata encFloor,
        uint8 nType
    ) external {
        require(rooms[roomId].status == RoomStatus.Open, "Room exists");

        Room storage room = rooms[roomId];

        // FHE: Store encrypted floor price (ZKPoK verified by CoFHE verifier)
        room.partyAPrice = FHE.asEuint64(encFloor);

        // FHE: Store encrypted address of Party A
        room.partyA = FHE.asEaddress(Encryptable.address(msg.sender));

        // Grant Party A access to their own ciphertext via permit
        FHE.allow(room.partyAPrice, msg.sender);
        FHE.allow(room.partyAPrice, address(this));

        room.status = RoomStatus.PendingB;
        room.createdAt = block.timestamp;
        room.negotiationType = nType;

        roomIds.push(roomId);
        emit RoomCreated(roomId, nType, block.timestamp);
    }

    /**
     * @notice Party B joins and triggers the blind comparison.
     * @param roomId      The room to join
     * @param encCeiling  InEuint64 — encrypted ceiling price with ZKPoK
     *
     * @dev Core FHE operations:
     *   1. FHE.gte(ceiling, floor)      — compare in encrypted space
     *   2. FHE.add(floor, ceiling)      — sum in encrypted space
     *   3. FHE.div(sum, euint64(2))     — midpoint in encrypted space
     *   4. FHE.select(match, mid, 0)    — conditional in ciphertext
     *
     * CRITICAL: Neither price is ever in cleartext at any point.
     * The CoFHE coprocessor executes all operations in FHE ciphertext space.
     */
    function joinAndCompute(
        bytes32 roomId,
        InEuint64 calldata encCeiling
    ) external {
        Room storage room = rooms[roomId];
        require(room.status == RoomStatus.PendingB, "Room not open");

        room.status = RoomStatus.Computing;

        // Store Party B's encrypted ceiling
        room.partyBPrice = FHE.asEuint64(encCeiling);
        room.partyB = FHE.asEaddress(Encryptable.address(msg.sender));
        FHE.allow(room.partyBPrice, msg.sender);
        FHE.allow(room.partyBPrice, address(this));

        // ── CORE FHE COMPUTATION ─────────────────────────────────────────────
        //
        // Step 1: Is there a deal? (ceiling >= floor, fully in ciphertext)
        ebool hasMatch = FHE.gte(room.partyBPrice, room.partyAPrice);

        // Step 2: Compute the midpoint in encrypted space
        //         Even this intermediate value is never decrypted on-chain
        euint64 encSum = FHE.add(room.partyAPrice, room.partyBPrice);
        euint64 encMidpoint = FHE.div(encSum, FHE.asEuint64(2));

        // Step 3: Conditional select — midpoint only if match, else 0
        //         FHE.select is the encrypted equivalent of (match ? mid : 0)
        euint64 encAgreed = FHE.select(hasMatch, encMidpoint, FHE.asEuint64(0));
        // ────────────────────────────────────────────────────────────────────

        room.matched = hasMatch;
        room.agreedPrice = encAgreed;

        // Grant both parties threshold decryption access via permit
        FHE.allow(room.matched, msg.sender);
        FHE.allow(room.matched, room_partyA_plain(roomId)); // helper below
        FHE.allow(room.agreedPrice, msg.sender);
        FHE.allow(room.agreedPrice, room_partyA_plain(roomId));

        // Allow public readback of the RESULT (not the inputs!)
        FHE.allowPublic(room.matched);     // ebool — match or no match
        FHE.allowThis(room.agreedPrice);   // euint64 — only via permit

        room.status = RoomStatus.Settled;
        emit MatchComputed(roomId, block.timestamp);
    }

    /**
     * @notice Party A or B requests decryption of the agreed price.
     *         The Threshold Network decrypts client-side only — never on-chain.
     */
    function requestDecryption(bytes32 roomId) external view
        returns (euint64 encAgreed, ebool encMatched)
    {
        Room storage room = rooms[roomId];
        require(room.status == RoomStatus.Settled, "Not settled");
        // Permit checked by FHE access control — only authorized addresses can decrypt
        return (room.agreedPrice, room.matched);
    }

    function getRoomStatus(bytes32 roomId) external view returns (RoomStatus) {
        return rooms[roomId].status;
    }

    // Internal helper — in production this would use FHE permit for address access
    function room_partyA_plain(bytes32 roomId) internal view returns (address) {
        // Simplified for demo — production would use FHE.decrypt via permit
        return address(0); // placeholder
    }
}`;

const REINEIRA_INTEGRATION = `// ReineiraOS Integration — Auto-settle on match
import { ReineiraSDK, walletClientToSigner } from "@reineira-os/sdk";

async function createConfidentialEscrow(
  agreedPrice: number,
  beneficiary: string,
  walletClient: any
) {
  // Initialize Reineira SDK with Fhenix CoFHE support
  const sdk = ReineiraSDK.create({
    network: "testnet",
    signer: walletClientToSigner(walletClient),
    coordinatorUrl: "https://coordinator.reineira.io",
    onFHEInit: (status) => console.log("FHE:", status),
  });

  await sdk.initialize();

  // Create ConfidentialEscrow — amount encrypted via CoFHE
  // Neither the escrow contract nor any observer can see the amount
  const escrow = await sdk.escrow
    .create()
    .amount(agreedPrice)           // Encrypted with FHE before submission
    .beneficiary(beneficiary)      // Encrypted beneficiary address (eaddress)
    .gate("0x0000...0000")        // No condition = unconditional release
    .execute();

  console.log("Escrow ID:", escrow.escrowId);
  console.log("Amount encrypted on-chain as euint64");

  // Fund the escrow (deposits USDC, wraps to ConfidentialUSDC)
  await sdk.escrow.fund(escrow.escrowId, agreedPrice);

  // Beneficiary redeems (Gate check → funds released)
  await sdk.escrow.redeem(escrow.escrowId);
}`;

const FRONTEND_USAGE = `// Client-side FHE encryption with @cofhe/sdk (new API)
import { createCofheConfig, createCofheClient } from "@cofhe/sdk/web";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { chains } from "@cofhe/sdk/chains";

// 1. Create client connected to Base Sepolia CoFHE coprocessor
const config = createCofheConfig({ supportedChains: [chains.baseSepolia] });
const client = createCofheClient(config);
await client.connect(publicClient, walletClient);

// 2. Encrypt a price — generates ZKPoK + ciphertext
const builder = client.encryptInputs([Encryptable.uint64(BigInt(price))]);
const [encrypted] = await builder.execute();
// encrypted → { ctHash, securityZone, utype, signature }
// Pass directly to contract as InEuint64

// 3. Decrypt for UI display (off-chain, requires permit)
await client.permits.getOrCreateSelfPermit();
const plaintext = await client.decryptForView(ctHash, FheTypes.Uint64).execute();

// 4. Decrypt for on-chain publication (threshold signature)
const { decryptedValue, signature } = await client
  .decryptForTx(ctHash)
  .withoutPermit()
  .execute();
// Then call contract.publishResult(roomId, matched, agreedPrice)`;

export default function ContractPage() {
  const [activeTab, setActiveTab] = useState<"contract" | "reineira" | "frontend">("contract");
  const [copied, setCopied] = useState(false);

  const codeMap = {
    contract: FULL_CONTRACT,
    reineira: REINEIRA_INTEGRATION,
    frontend: FRONTEND_USAGE,
  };

  const copy = () => {
    navigator.clipboard.writeText(codeMap[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="pt-24 pb-16 px-6 max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <FHEBadge label="Fhenix CoFHE" />
            <FHEBadge variant="reineira" label="ReineiraOS" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Smart Contract</h1>
          <p className="text-muted-foreground">
            The full <code className="text-primary">BlindNegotiation.sol</code> contract, ReineiraOS escrow integration,
            and frontend SDK usage. All code is open source.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { key: "contract" as const, label: "BlindNegotiation.sol", icon: Code2, color: "text-primary" },
            { key: "reineira" as const, label: "ReineiraOS Escrow", icon: Shield, color: "text-accent" },
            { key: "frontend" as const, label: "Frontend SDK", icon: Zap, color: "text-yellow-400" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeTab === tab.key
                  ? "border-primary/30 bg-primary/5"
                  : "border-border hover:border-border/80"
              }`}
            >
              <tab.icon className={`w-5 h-5 mb-2 ${activeTab === tab.key ? tab.color : "text-muted-foreground"}`} />
              <div className="text-sm font-medium">{tab.label}</div>
            </button>
          ))}
        </div>

        <div className="card-dark rounded-xl overflow-hidden border border-border">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="text-xs text-muted-foreground ml-2 font-mono">
                {activeTab === "contract" ? "BlindNegotiation.sol" :
                 activeTab === "reineira" ? "reineira-integration.ts" :
                 "cofhe-client.ts"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/FhenixProtocol/cofhe-contracts"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                CoFHE Contracts
              </a>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted/50 px-2 py-1 rounded border border-border"
              >
                {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div className="overflow-auto max-h-[600px]">
            <pre className="p-6 text-xs font-mono leading-relaxed text-muted-foreground">
              <code>{codeMap[activeTab]}</code>
            </pre>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card-dark p-4">
            <h3 className="text-sm font-semibold mb-2 text-primary">FHE Operations Used</h3>
            <div className="space-y-1.5 text-xs font-mono">
              {["FHE.asEuint64()", "FHE.asEaddress()", "FHE.gte(a, b)", "FHE.add(a, b)", "FHE.div(a, 2)", "FHE.select(bool, a, b)", "FHE.allow()", "FHE.allowPublic()"].map(op => (
                <div key={op} className="text-primary">{op}</div>
              ))}
            </div>
          </div>
          <div className="card-dark p-4">
            <h3 className="text-sm font-semibold mb-2 text-accent">ReineiraOS Modules</h3>
            <div className="space-y-1.5 text-xs font-mono">
              {["sdk.escrow.create()", "sdk.escrow.fund()", "sdk.escrow.redeem()", "ConfidentialEscrow", "ConfidentialUSDC", "IConditionResolver", "sdk.usdc(amount)", "walletClientToSigner()"].map(op => (
                <div key={op} className="text-accent">{op}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
