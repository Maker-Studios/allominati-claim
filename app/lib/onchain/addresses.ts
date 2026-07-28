import type { Address } from "viem";

export const NFT_ADDRESS: Address = "0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5";
export const SAFE_ADDRESS: Address = "0x82105Ebf24D92A5F4879789B11116f64D941F719";
export const NFT_DEPLOY_BLOCK = 21931482n;

export const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_CLAIM_ADDRESS ?? "") as Address;

export const IS_LOCAL = process.env.NEXT_PUBLIC_CHAIN !== "mainnet";
// Anvil fork RPC — local by default, or a hosted fork (e.g. Railway).
export const FORK_RPC_URL = process.env.NEXT_PUBLIC_FORK_RPC_URL ?? "http://127.0.0.1:8545";
// Dev-only impersonation default: NEXT_PUBLIC_IMPERSONATE seeds the account
// picker on the connect screen (first run only — the browser's own selection
// wins afterwards). Transactions are sent unsigned and `anvil
// --auto-impersonate` executes them. Only honored on the local fork.
export const IMPERSONATE = (process.env.NEXT_PUBLIC_IMPERSONATE ?? "") as Address;
