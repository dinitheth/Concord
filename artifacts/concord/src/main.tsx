// Handle dynamic import / chunk load errors (e.g. after a new deployment)
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    console.warn("[Vite] Preload error detected, reloading page...", event);
    event.preventDefault();
    const lastReload = window.sessionStorage.getItem("vite-preload-error-reload");
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      window.sessionStorage.setItem("vite-preload-error-reload", now.toString());
      window.location.reload();
    } else {
      console.error("[Vite] Preload error recurred within 10s. Stopping automatic reload.");
    }
  });
}

import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import App from "./App";
import { wagmiConfig } from "./lib/wagmi-config";
import "./index.css";
import { ThemeProvider } from "./lib/ThemeContext";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const connectKitTheme = {
  "--ck-font-family":
    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
  "--ck-overlay-background": "rgba(0, 0, 0, 0.72)",
  "--ck-overlay-backdrop-filter": "blur(24px) saturate(180%)",
  "--ck-modal-background": "hsl(var(--card))",
  "--ck-modal-box-shadow": "0 32px 96px rgba(0,0,0,0.72), 0 0 0 0.5px hsl(var(--border))",
  "--ck-border-radius": "16px",
  "--ck-body-background": "hsl(var(--card))",
  "--ck-body-background-secondary": "hsl(var(--secondary))",
  "--ck-body-background-tertiary": "hsl(var(--muted))",
  "--ck-body-color": "hsl(var(--foreground))",
  "--ck-body-color-muted": "hsl(var(--muted-foreground))",
  "--ck-body-color-muted-hover": "hsl(var(--foreground))",
  "--ck-body-action-color": "#0a84ff",
  "--ck-body-divider": "hsl(var(--border))",
  "--ck-primary-button-background": "hsl(var(--secondary))",
  "--ck-primary-button-hover-background": "hsl(var(--muted))",
  "--ck-primary-button-color": "hsl(var(--foreground))",
  "--ck-primary-button-box-shadow": "inset 0 0 0 0.5px hsl(var(--border))",
  "--ck-primary-button-border-radius": "12px",
  "--ck-secondary-button-background": "hsl(var(--secondary))",
  "--ck-secondary-button-hover-background": "hsl(var(--muted))",
  "--ck-secondary-button-color": "hsl(var(--foreground))",
  "--ck-secondary-button-border-radius": "12px",
  "--ck-focus-color": "#0a84ff",
  "--ck-spinner-color": "#0a84ff",
  "--ck-connectbutton-background": "hsl(var(--secondary))",
  "--ck-connectbutton-hover-background": "hsl(var(--muted))",
  "--ck-connectbutton-color": "hsl(var(--foreground))",
  "--ck-connectbutton-border-radius": "20px",
  "--ck-connectbutton-box-shadow": "inset 0 0 0 0.5px hsl(var(--border))",
  "--ck-tooltip-background": "hsl(var(--secondary))",
  "--ck-tooltip-color": "hsl(var(--foreground))",
  "--ck-qr-dot-color": "#0a84ff",
  "--ck-qr-border-color": "hsl(var(--border))",
};

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="auto"
          customTheme={connectKitTheme}
          options={{
            hideNoWalletCTA: false,
            initialChainId: 84532,
            language: "en-US",
          }}
        >
          <App />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </ThemeProvider>
);

