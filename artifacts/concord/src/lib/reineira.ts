/**
 * @module reineira
 * @description ReineiraOS ConfidentialEscrow integration helpers.
 */
import type { WalletClient } from "viem";
import type { ReineiraSDK as ReineiraSDKType } from "@reineira-os/sdk";

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

type ReineiraWalletClient = {
  transport: { url?: string };
  chain?: { id: number };
  account: { address: string };
  request: (...args: unknown[]) => Promise<unknown>;
};

async function createSdk(walletClient: WalletClient): Promise<ReineiraSDKType> {
  if (!walletClient.account) {
    throw new Error("Wallet account is required for ReineiraOS escrow actions.");
  }

  const { ReineiraSDK, walletClientToSigner } = await import("@reineira-os/sdk");
  const signer = await walletClientToSigner(walletClient as unknown as ReineiraWalletClient);

  return ReineiraSDK.create({
    network: "testnet",
    signer,
    coordinatorUrl: "https://coordinator.reineira.io",
    onFHEInit: (status: "starting" | "done" | "error") => console.log("[ReineiraOS] FHE:", status),
  });
}

/**
 * Create and fund a ReineiraOS escrow for the agreed deal price.
 */
export async function createDealEscrow(config: EscrowConfig): Promise<EscrowResult> {
  const { agreedPrice, beneficiary, roomId, walletClient } = config;

  try {
    const sdk = await createSdk(walletClient);
    const escrow = await sdk.escrow.create({
      owner: beneficiary,
      amount: agreedPrice,
    });

    console.log("[ReineiraOS] Escrow created:", escrow.id.toString(), "for room", roomId);

    const fundResult = await escrow.fund(agreedPrice, { autoApprove: true });
    console.log("[ReineiraOS] Escrow funded:", fundResult.tx.hash);

    return {
      escrowId: escrow.id.toString(),
      txHash: fundResult.tx.hash,
      status: "funded",
    };
  } catch (err) {
    console.error("[ReineiraOS] Escrow creation failed:", err);
    throw err;
  }
}

/**
 * Redeem a funded escrow.
 */
export async function redeemEscrow(
  escrowId: string,
  walletClient: WalletClient,
): Promise<EscrowResult> {
  try {
    const sdk = await createSdk(walletClient);
    const escrow = sdk.escrow.get(BigInt(escrowId));
    const result = await escrow.redeem();

    console.log("[ReineiraOS] Escrow redeemed:", result.hash);

    return {
      escrowId,
      txHash: result.hash,
      status: "redeemed",
    };
  } catch (err) {
    console.error("[ReineiraOS] Escrow redemption failed:", err);
    throw err;
  }
}

/**
 * Check whether a ReineiraOS escrow exists and has been funded.
 */
export async function getEscrowStatus(
  escrowId: string,
  walletClient: WalletClient,
): Promise<EscrowResult> {
  try {
    const sdk = await createSdk(walletClient);
    const escrow = sdk.escrow.get(BigInt(escrowId));
    const exists = await escrow.exists();
    const isFunded = exists ? await escrow.isFunded() : false;

    return {
      escrowId,
      txHash: "",
      status: isFunded ? "funded" : exists ? "created" : "expired",
    };
  } catch (err) {
    console.error("[ReineiraOS] Status check failed:", err);
    throw err;
  }
}
