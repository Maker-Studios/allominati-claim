"use client";

import { ConnectKitProvider } from "connectkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { WagmiProvider } from "wagmi";
import type { Address } from "viem";
import { makeWagmiConfig } from "../lib/onchain/wagmi";
import {
  ImpersonationContext,
  defaultImpersonation,
  loadImpersonation,
  persistImpersonation,
} from "../lib/onchain/impersonation";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Start from the SSR-safe env default, then adopt what this browser last
  // used (post-hydration to avoid a server/client mismatch).
  const [imp, setImp] = useState(defaultImpersonation);
  useEffect(() => {
    setImp(loadImpersonation());
  }, []);

  const impersonation = useMemo(
    () => ({
      account: imp.account,
      saved: imp.saved,
      select: (account: Address | null) =>
        setImp((s) => {
          const saved = account && !s.saved.includes(account) ? [account, ...s.saved] : s.saved;
          persistImpersonation(account, saved);
          return { account, saved };
        }),
      remove: (account: Address) =>
        setImp((s) => {
          const saved = s.saved.filter((a) => a !== account);
          const active = s.account === account ? null : s.account;
          persistImpersonation(active, saved);
          return { account: active, saved };
        }),
    }),
    [imp],
  );

  // Switching identity rebuilds the wagmi config (new mock connector) and
  // resets connection state via the provider key. The query client survives
  // the switch: account-specific queries key on the address, and shared
  // caches (ENS names, token art) staying warm avoids flashes on remount.
  const config = useMemo(() => makeWagmiConfig(imp.account), [imp.account]);
  const queryClient = useRef<QueryClient | null>(null);
  if (!queryClient.current) queryClient.current = new QueryClient();

  return (
    <ImpersonationContext.Provider value={impersonation}>
      <WagmiProvider config={config} key={imp.account ?? "real-wallet"}>
        <QueryClientProvider client={queryClient.current}>
          <ConnectKitProvider
            theme="midnight"
            customTheme={{
              "--ck-focus-color": "#46d6a6",
              "--ck-qr-dot-color": "#46d6a6",
            }}
          >
            {children}
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ImpersonationContext.Provider>
  );
}
