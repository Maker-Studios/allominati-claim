# Allominati Dual Claim

Redemption dApp for the soulbound [AlloPatronNFT](https://etherscan.io/address/0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5) (mainnet). Holders redeem each NFT's pro-rated mint value in WETH — refunded to their wallet or routed into admin-registered projects. The contract holds no funds: every claim pulls WETH straight from the treasury Safe (`0x82105Ebf…F719`) via an ERC-20 allowance the Safe grants the contract.

## Architecture

- **`contracts/src/AlloDualClaim.sol`** — the coordinating contract. The NFT is soulbound (no transfers/burns), so redemption is tracked here per tokenId, gated on `ownerOf`. The contract never holds funds: claims are paid in WETH pulled from the treasury Safe with `transferFrom`, capped at exactly the allowance the Safe approves. Claims are open until `closesAt`, which the owner can extend but never shorten; after it closes the Safe simply revokes the allowance (nothing to sweep). Admin (owner) also registers/updates/deactivates projects, seeds per-token values, and can repoint the treasury.
- **`scripts/derive-values.ts`** — replays the NFT's bonding curve from mint events to compute each token's paid price (admin mints get 0), checksummed against every `TokensMinted` event and the live contract state, then pro-rates every value to the pool the Safe can cover (paid total minus the hardcoded 7.5 ETH shortfall ≈ 56.7%). Writes `contracts/data/token-values.json` + a liability report.
- **`app/lib/onchain/`** — wagmi/viem config, ABI, and hooks; ConnectKit for wallet connection (`app/components/providers.tsx`).
- **`app/api/sendoff/`** — signed send-off messages. The holder signs a canonical payload (`app/lib/sendoff.ts`) with their wallet; the route verifies the EIP-191 signature (RPC-backed, so ERC-1271 smart wallets work too) and stores the row in Postgres via Prisma (`DATABASE_URL`, schema in `prisma/schema.prisma`). Signatures are required unconditionally — impersonated dev sessions sign with anvil's dev key, verified through the `DevSigner1271` shim that `anvil:setup` etches onto impersonation accounts (custom impersonated addresses added by hand won't have the shim, so their send-offs are rejected; skip with "continue to claim"). Without `DATABASE_URL`, local dev falls back to `data/sendoff-messages.jsonl`.

## Local development (anvil mainnet fork — no real transactions)

```bash
cp .env.example .env.local     # first time only
npm run forge:build            # compile contracts (needs Foundry)
npm run derive                 # compute per-token values from mainnet history
npm run anvil                  # terminal 1: mainnet fork with auto-impersonation
npm run anvil:setup            # terminal 2: deploy, seed, Safe wraps+approves WETH, demo projects
npm run dev                    # terminal 3: app at localhost:3000
npm run db:migrate             # optional: apply Prisma migrations (needs postgres;
                               # see DATABASE_URL in .env.example for a docker one-liner)
npm run e2e                    # optional: headless end-to-end claim + on-chain asserts
                               # (requires anvil:setup -- --impersonate)
```

`anvil:setup` writes `NEXT_PUBLIC_CLAIM_ADDRESS` into `.env.local`. By default you connect your **real wallet** through ConnectKit — add the fork to it as a network (RPC `http://127.0.0.1:8545`, chain id `31337`).

To browse without a wallet, enable **impersonation**: run `npm run anvil:setup -- --impersonate` (writes `NEXT_PUBLIC_IMPERSONATE=<richest real holder>`) or set `NEXT_PUBLIC_IMPERSONATE` to any address yourself — e.g. `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (the local contract owner) to use the admin console. The mock connector then signs nothing; anvil's `--auto-impersonate` executes the transactions. Clear the variable (and restart `npm run dev`) to go back to a real wallet. Impersonation is ignored when `NEXT_PUBLIC_CHAIN=mainnet`.

Contract tests run on a mainnet fork: `npm run forge:test`.

## Mainnet deployment (when ready)

1. `npm run derive` — fresh values; aborts if the Safe's ETH + WETH no longer covers the pool.
2. `cd contracts && CLAIM_OWNER=0x... CLAIM_CLOSES_AT=<unix ts> forge script script/Deploy.s.sol:Deploy --rpc-url $ETH_RPC_URL --broadcast --private-key $DEPLOYER_KEY --verify` — one broadcast deploys, seeds all values from `data/token-values.json`, and transfers ownership to `CLAIM_OWNER`. The redemption window is 1 month: set `CLAIM_CLOSES_AT` to now + 30 days (it can be extended later via `extendWindow`, never shortened).
3. The Safe funds the pool: wrap `totalSeeded()` into WETH (`deposit`), then `approve` the deployed address for exactly that amount. The approval is the go-live switch — no Safe module involved, and revoking the allowance shuts claims down.
4. Set `NEXT_PUBLIC_CHAIN=mainnet`, `NEXT_PUBLIC_CLAIM_ADDRESS`, `NEXT_PUBLIC_RPC_URL`, and a real `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.

> Values are pro-rated: 7.5 ETH of the 17.32 ETH mint proceeds was spent, so every token redeems ~56.7% of its mint price and the seeded total (~9.8238 WETH) is fully covered by the approved allowance — every claim is payable, first to last. Claims stay open until `closesAt` (owner-extendable, never shortenable); after that the Safe revokes the WETH allowance — unclaimed value never left the Safe.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
