import { getDefaultConfig } from "connectkit";
import { createConfig, http } from "wagmi";
import { mainnet, foundry as foundryBase } from "wagmi/chains";
import { mock } from "wagmi/connectors";
import type { Address } from "viem";
import { IS_LOCAL, FORK_RPC_URL } from "./addresses";

// The local chain is an anvil fork of mainnet, so mainnet's infrastructure
// contracts (multicall3, the ENS registry + universal resolver) all exist —
// viem's stock `foundry` chain just doesn't declare them. Declaring them
// makes wagmi's ENS hooks work against the fork.
export const localFork = {
  ...foundryBase,
  contracts: {
    ...mainnet.contracts,
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as const },
  },
} as const;

export const activeChain = IS_LOCAL ? localFork : mainnet;

const transports = {
  [localFork.id]: http(FORK_RPC_URL),
  [mainnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
} as const;

/**
 * Build the wagmi config for the current impersonation choice. Impersonation
 * is picked at runtime (see impersonation.tsx), so the provider rebuilds this
 * whenever the selection changes.
 */
export function makeWagmiConfig(impersonate: Address | null) {
  return IS_LOCAL && impersonate
    ? // Impersonation mode: the mock connector supplies the impersonated account
      // and forwards eth_sendTransaction unsigned to anvil (--auto-impersonate).
      createConfig({
        chains: [activeChain],
        connectors: [mock({ accounts: [impersonate] })],
        transports,
        ssr: true,
      })
    : createConfig(
        getDefaultConfig({
          appName: "Allominati Dual Claim",
          walletConnectProjectId:
            process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000",
          chains: [activeChain],
          transports,
          ssr: true,
          // Skip the promoted "Continue with Aave" account connector.
          enableAaveAccount: false,
        }),
      );
}
