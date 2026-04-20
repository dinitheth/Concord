/**
 * @module reineira
 * @description ReineiraOS ConfidentialEscrow integration
 *
 * Uses the @reineira-os/sdk for creating, funding, and redeeming
 * confidential escrows where even the contract never sees plaintext amounts.
 *
 * SDK: https://www.npmjs.com/package/@reineira-os/sdk
 * Docs: https://reineira.xyz/docs
 * Dev Toolkit: https://github.com/ReineiraOS/reineira-code
 */
import type { WalletClient } from "viem";

// ── Types ───────────────────────────────────────────────────────

export interface EscrowConfig {
  agreedPrice: bigint;
  beneficiary: string;
  roomId: string;
  walletClient: WalletClient;
}

export interface EscrowResult {
  escrowId: string;
  txHash: string;
  status: "created" | "funded" | "redeemed" | "expired";
}

// ── ReineiraOS Escrow Integration ───────────────────────────────

/**
 * Create a ConfidentialEscrow for the agreed deal price.
 *
 * Flow:
 *   1. Initialize the ReineiraOS SDK with FHE support
 *   2. Create an escrow with the agreed price (FHE-encrypted on-chain)
 *   3. Fund the escrow (deposit USDC → ConfidentialUSDC)
 *   4. Return escrow details for settlement tracking
 */
export async function createDealEscrow(config: EscrowConfig): Promise<EscrowResult> {
  const { agreedPrice, beneficiary, roomId, walletClient } = config;

  try {
    // Dynamic import to avoid bundling issues if SDK not available
    const { ReineiraSDK, walletClientToSigner } = await import("@reineira-os/sdk");

    const signer = walletClientToSigner(walletClient);

    const sdk = ReineiraSDK.create({
      network: "testnet",
      signer,
      coordinatorUrl: "https://coordinator.reineira.io",
      onFHEInit: (status: string) => console.log("[ReineiraOS] FHE:", status),
    });

    // Create the escrow — amount is encrypted via FHE before being sent on-chain
    const escrow = await sdk.escrow.create({
      beneficiary,
      amount: Number(agreedPrice),
      token: "USDC",
      metadata: {
        protocol: "concord",
        roomId,
        timestamp: Date.now(),
      },
    });

    console.log("[ReineiraOS] Escrow created:", escrow.escrowId);

    // Fund the escrow (wraps USDC → ConfidentialUSDC)
    const fundTx = await sdk.escrow.fund(escrow.escrowId, Number(agreedPrice));

    console.log("[ReineiraOS] Escrow funded:", fundTx.transactionHash);

    return {
      escrowId: escrow.escrowId,
      txHash: fundTx.transactionHash,
      status: "funded",
    };
  } catch (err) {
    console.error("[ReineiraOS] Escrow creation failed:", err);
    throw err;
  }
}

/**
 * Redeem a funded escrow (called by the beneficiary after gate check).
 */
export async function redeemEscrow(
  escrowId: string,
  walletClient: WalletClient,
): Promise<EscrowResult> {
  try {
    const { ReineiraSDK, walletClientToSigner } = await import("@reineira-os/sdk");

    const signer = walletClientToSigner(walletClient);

    const sdk = ReineiraSDK.create({
      network: "testnet",
      signer,
      coordinatorUrl: "https://coordinator.reineira.io",
    });

    const result = await sdk.escrow.redeem(escrowId);

    console.log("[ReineiraOS] Escrow redeemed:", result.transactionHash);

    return {
      escrowId,
      txHash: result.transactionHash,
      status: "redeemed",
    };
  } catch (err) {
    console.error("[ReineiraOS] Escrow redemption failed:", err);
    throw err;
  }
}

/**
 * Check the status of an escrow.
 */
export async function getEscrowStatus(
  escrowId: string,
  walletClient: WalletClient,
): Promise<EscrowResult> {
  try {
    const { ReineiraSDK, walletClientToSigner } = await import("@reineira-os/sdk");

    const signer = walletClientToSigner(walletClient);

    const sdk = ReineiraSDK.create({
      network: "testnet",
      signer,
      coordinatorUrl: "https://coordinator.reineira.io",
    });

    const status = await sdk.escrow.status(escrowId);

    return {
      escrowId,
      txHash: "",
      status: status.state as "created" | "funded" | "redeemed" | "expired",
    };
  } catch (err) {
    console.error("[ReineiraOS] Status check failed:", err);
    throw err;
  }
}
