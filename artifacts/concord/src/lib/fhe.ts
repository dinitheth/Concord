/**
 * @module fhe
 * @description Real FHE integration using @cofhe/sdk (v0.4.0+)
 *
 * Architecture per docs (https://cofhe-docs.fhenix.zone):
 *   - createCofheConfig + createCofheClient → lightweight, sync
 *   - client.connect() → lightweight, just registers chain + wallet
 *   - client.encryptInputs().execute() → HEAVY (lazy loads TFHE WASM + keys on first call)
 *     Steps: InitTfhe → FetchKeys → Pack → Prove → Verify
 *   - client.decryptForView() → off-chain decrypt for UI (requires permit)
 *   - client.decryptForTx() → returns {decryptedValue, signature} for on-chain publication
 *
 * Docs: https://cofhe-docs.fhenix.zone/client-sdk/introduction/migrating-from-cofhejs
 */
import { createCofheConfig, createCofheClient } from "@cofhe/sdk/web";
import { Encryptable, FheTypes, isCofheError } from "@cofhe/sdk";
import { chains } from "@cofhe/sdk/chains";
import type { PublicClient, WalletClient } from "viem";

// ── Types ───────────────────────────────────────────────────────
export type FHEStatus = "idle" | "initializing" | "encrypting" | "encrypted" | "decrypting" | "error";

/** Named encryption steps from @cofhe/sdk EncryptStep enum */
export type EncryptStepName = "InitTfhe" | "FetchKeys" | "Pack" | "Prove" | "Verify" | string;

export interface EncryptProgress {
  step: EncryptStepName;
  isStart: boolean;
  duration?: number; // ms, only on isEnd
}

export interface EncryptedPrice {
  encryptedInput: any; // EncryptedUint64Input — passed directly to contract args
  ctHash: string;
}

export interface DecryptedResult {
  matched: boolean;
  agreedPrice: bigint;
  signature?: string;
}

// ── Singleton Client ────────────────────────────────────────────
// connect() is lightweight — TFHE WASM loads lazily on first encrypt.

const config = createCofheConfig({
  supportedChains: [chains.baseSepolia],
});

let client: ReturnType<typeof createCofheClient> | null = null;
let isConnected = false;

/**
 * Initialize the CoFHE client. connect() is fast (~100ms).
 * Safe to call multiple times — no-op if already connected.
 */
export async function initFHE(
  publicClient: PublicClient,
  walletClient: WalletClient,
): Promise<void> {
  if (!client) {
    client = createCofheClient(config);
  }
  if (!isConnected) {
    await client.connect(publicClient, walletClient);
    isConnected = true;
    console.log("[FHE] CoFHE client connected to Base Sepolia");
  }
}

/**
 * Encrypt a price value using the CoFHE SDK.
 * Returns an EncryptedUint64Input that can be passed directly to the contract.
 *
 * On FIRST call, this triggers:
 *   1. InitTfhe  — download TFHE WASM (~2-4s)
 *   2. FetchKeys — fetch FHE public key from chain (~1-2s)
 *   3. Pack      — pack plaintext into TFHE format (fast)
 *   4. Prove     — generate ZK proof (CPU, ~2-4s)
 *   5. Verify    — CoFHE verifier signs the input (~1s network)
 *
 * On SUBSEQUENT calls, steps 1-2 are skipped (cached).
 *
 * @param value      - The plaintext price as a BigInt
 * @param onProgress - Detailed step callback with timing info
 */
export async function encryptPrice(
  value: bigint,
  onProgress?: (progress: EncryptProgress) => void,
): Promise<EncryptedPrice> {
  if (!client || !isConnected) {
    throw new Error("[FHE] Client not initialized. Call initFHE() first.");
  }

  try {
    console.time("[FHE] encryptPrice");

    const [encrypted] = await client
      .encryptInputs([Encryptable.uint64(value)])
      .onStep((step: string, ctx: any) => {
        const progress: EncryptProgress = {
          step: step as EncryptStepName,
          isStart: !!ctx?.isStart,
          duration: ctx?.duration,
        };
        if (ctx?.isStart) console.log(`[FHE] Starting: ${step}`);
        if (ctx?.isEnd) console.log(`[FHE] Done: ${step} (${ctx.duration}ms)`);
        if (onProgress) onProgress(progress);
      })
      .execute();

    console.timeEnd("[FHE] encryptPrice");
    console.log("[FHE] Encrypted price:", { ctHash: encrypted.ctHash });

    return {
      encryptedInput: encrypted,
      ctHash: String(encrypted.ctHash ?? ""),
    };
  } catch (err) {
    if (isCofheError(err)) {
      console.error("[FHE] Encryption error:", err.code, err.message);
    }
    throw err;
  }
}

/**
 * Decrypt a ciphertext for UI display (off-chain).
 * Uses decryptForView — requires an active permit.
 */
export async function decryptForView(
  ctHash: string,
  type: typeof FheTypes.Uint64 = FheTypes.Uint64,
): Promise<bigint> {
  if (!client || !isConnected) {
    throw new Error("[FHE] Client not initialized. Call initFHE() first.");
  }

  await client.permits.getOrCreateSelfPermit();

  const plaintext = await client
    .decryptForView(ctHash, type)
    .execute();

  return plaintext as bigint;
}

/**
 * Decrypt a ciphertext for on-chain publication.
 * Uses decryptForTx — returns value + Threshold Network signature.
 * Caller must then call publishDecryptResult() on-chain.
 */
export async function decryptForTx(
  ctHash: string,
): Promise<{ decryptedValue: bigint; signature: string }> {
  if (!client || !isConnected) {
    throw new Error("[FHE] Client not initialized. Call initFHE() first.");
  }

  const result = await client
    .decryptForTx(ctHash)
    .withoutPermit()
    .execute();

  return {
    decryptedValue: result.decryptedValue as bigint,
    signature: result.signature,
  };
}

/**
 * Decrypt the match result (ebool) for UI display.
 */
export async function decryptMatchForView(ctHash: string): Promise<boolean> {
  if (!client || !isConnected) {
    throw new Error("[FHE] Client not initialized. Call initFHE() first.");
  }

  await client.permits.getOrCreateSelfPermit();

  const result = await client
    .decryptForView(ctHash, FheTypes.Bool)
    .execute();

  return result as boolean;
}

/**
 * Format a ciphertext hash for display.
 */
export function formatCtHash(ctHash: string): string {
  if (!ctHash || ctHash.length < 20) return ctHash;
  return `${ctHash.slice(0, 10)}…${ctHash.slice(-6)}`;
}

/**
 * Format a ciphertext for visual display (longer format for UI components).
 */
export function formatCiphertextDisplay(ciphertext: string, maxLen = 64): string {
  if (!ciphertext) return "";
  const hex = ciphertext.startsWith("0x") ? ciphertext.slice(2) : ciphertext;
  if (hex.length <= maxLen) return `0x${hex}`;
  return `0x${hex.slice(0, maxLen)}…`;
}
