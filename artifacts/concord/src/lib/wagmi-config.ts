import { createConfig, http } from "wagmi";
import { baseSepolia, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { getDefaultConfig } from "connectkit";

// Base Sepolia chain config (CoFHE-supported for FHE operations)
// Chain ID: 84532

type AnyWindow = Window & {
  ethereum?: Record<string, unknown> & { isMetaMask?: boolean; providers?: (Record<string, unknown> & { isMetaMask?: boolean })[] };
  okxwallet?: Record<string, unknown>;
};

function getOtherProvider() {
  if (typeof window === "undefined") return undefined;
  const w = window as AnyWindow;
  // Prefer OKX wallet if available
  if (w.okxwallet) return w.okxwallet as never;
  const eth = w.ethereum;
  if (!eth) return undefined;
  // In multi-wallet browsers, pick the first non-MetaMask provider
  if (Array.isArray(eth.providers)) {
    const other = eth.providers.find((p) => !p.isMetaMask);
    if (other) return other as never;
  }
  // Last resort: any injected provider
  return eth as never;
}

// Multi-wallet icon: four colored tiles in a 2×2 grid
const OTHER_WALLETS_ICON =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#2c2c2e"/>
      <rect x="4" y="4" width="11" height="11" rx="3" fill="#7B68EE"/>
      <rect x="17" y="4" width="11" height="11" rx="3" fill="#1652F0"/>
      <rect x="4" y="17" width="11" height="11" rx="3" fill="#F6851B"/>
      <rect x="17" y="17" width="11" height="11" rx="3" fill="#24C38B"/>
    </svg>`
  );

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [baseSepolia, mainnet],
    transports: {
      [baseSepolia.id]: http("https://sepolia.base.org"),
      [mainnet.id]: http(),
    },
    connectors: [
      injected({ target: "metaMask" }),
      injected({
        target: {
          id: "other-wallets",
          name: "Other Wallets",
          provider: getOtherProvider(),
          icon: OTHER_WALLETS_ICON,
        },
      }),
    ],
    appName: "Concord",
    appDescription: "Blind negotiation protocol — two parties discover if they have a deal without revealing reservation prices.",
    appUrl: typeof window !== "undefined" ? window.location.origin : "https://concord.app",
  })
);

export type WagmiConfig = typeof wagmiConfig;
