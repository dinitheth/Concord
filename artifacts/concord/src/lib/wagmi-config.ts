import { createConfig, http, fallback } from "wagmi";
import { baseSepolia, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { getDefaultConfig } from "connectkit";

// Base Sepolia chain config (CoFHE-supported for FHE operations)
// Chain ID: 84532
// Use multiple CORS-friendly RPC endpoints with fallback

type AnyWindow = Window & {
  ethereum?: InjectedProvider;
  okxwallet?: InjectedProvider;
};

type InjectedProvider = Record<string, unknown> & {
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
};

function getOtherProvider(): InjectedProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as AnyWindow;
  // Prefer OKX wallet if available
  if (w.okxwallet) return w.okxwallet as never;
  const eth = w.ethereum;
  if (!eth) return undefined;
  // In multi-wallet browsers, pick the first non-MetaMask provider
  if (Array.isArray(eth.providers)) {
    const other = eth.providers.find((p: InjectedProvider) => !p.isMetaMask);
    if (other) return other;
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
      [baseSepolia.id]: fallback([
        http("https://sepolia.base.org"),
        http("https://base-sepolia-rpc.publicnode.com"),
        http("https://base-sepolia.blockpi.network/v1/rpc/public"),
      ]),
      [mainnet.id]: fallback([
        http("https://eth.llamarpc.com"),
        http("https://ethereum-rpc.publicnode.com"),
      ]),
    },
    connectors: [
      injected({ target: "metaMask" }),
      injected({
        target: {
          id: "other-wallets",
          name: "Other Wallets",
          provider: () => getOtherProvider() as never,
          icon: OTHER_WALLETS_ICON,
        },
      }),
    ],
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "concord-local-dev",
    appName: "Concord",
    appDescription: "Blind negotiation protocol — two parties discover if they have a deal without revealing reservation prices.",
    appUrl: typeof window !== "undefined" ? window.location.origin : "https://concord.app",
  })
);

export type WagmiConfig = typeof wagmiConfig;
