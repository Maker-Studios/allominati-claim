# Allominati Dual Claim

Redemption dApp for the soulbound [AlloPatronNFT](https://etherscan.io/address/0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5) (mainnet). Holders redeem each NFT's pro-rated mint value in WETH — refunded to their wallet or routed into admin-registered projects. The contract holds no funds: every claim pulls WETH straight from the treasury Safe (`0x82105Ebf…F719`) via an ERC-20 allowance the Safe grants the contract.

## Architecture

- **`contracts/src/AlloDualClaim.sol`** — the coordinating contract. The NFT is soulbound (no transfers/burns), so redemption is tracked here per tokenId, gated on `ownerOf`. The contract never holds funds: claims are paid in WETH pulled from the treasury Safe with `transferFrom`, capped at exactly the allowance the Safe approves. Claims are open until `closesAt`, which the owner can extend but never shorten; after it closes the Safe simply revokes the allowance (nothing to sweep). Admin (owner) also registers/updates/deactivates projects, seeds per-token values, and can repoint the treasury.
- **`scripts/derive-values.ts`** — replays the NFT's bonding curve from mint events to compute each token's paid price (admin mints get 0), checksummed against every `TokensMinted` event and the live contract state, then pro-rates every value to the pool the Safe can cover (paid total minus the hardcoded 7.5 ETH shortfall ≈ 56.7%). Writes `contracts/data/token-values.json` + a liability report.
- **`app/lib/onchain/`** — wagmi/viem config, ABI, and hooks; ConnectKit for wallet connection (`app/components/providers.tsx`).
- **`app/api/sendoff/`** — signed send-off messages. The holder signs a canonical payload (`app/lib/sendoff.ts`) with their wallet; the route verifies the EIP-191 signature (RPC-backed, so ERC-1271 smart wallets work too) and stores the row in Postgres via Prisma (`DATABASE_URL`, schema in `prisma/schema.prisma`). Signatures are required unconditionally — impersonated dev sessions sign with anvil's dev key, verified through the `DevSigner1271` shim that `anvil:setup` etches onto impersonation accounts (custom impersonated addresses added by hand won't have the shim, so their send-offs are rejected; skip with "continue to claim"). Without `DATABASE_URL`, local dev falls back to `data/sendoff-messages.jsonl`.

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | ≥ 20.9 (Next 16 requirement) | app, scripts |
| [Foundry](https://getfoundry.sh) | `forge` + `anvil` | contracts, local fork |
| Postgres | 17 (any recent) | send-off messages — optional locally, **required on mainnet** |
| Mainnet RPC URL | keyed provider recommended | forking, fork tests, `derive` log scans |

Bun and npm both work. `bun.lock` is the committed lockfile; `.npmrc` sets `legacy-peer-deps=true` for npm installs.

## First-time setup

```bash
git submodule update --init --recursive   # forge-std + openzeppelin (pinned in foundry.lock)
bun install                               # or: npm install
cp .env.example .env.local
```

`install` runs `prisma generate` via `postinstall`, which writes the client to `app/generated/prisma` (gitignored). Without the submodules, `forge build` fails — the contracts import both.

## Local development (anvil mainnet fork — no real transactions)

Three terminals. Steps 1–2 are one-time per checkout; step 3 must be re-run whenever the fork is reset.

```bash
# one-time
npm run forge:build            # compile contracts
npm run derive                 # replay mainnet history → contracts/data/token-values.json

# terminal 1 — the fork (chain id 31337, port 8545)
npm run anvil

# terminal 2 — deploy + seed onto the fork
npm run anvil:setup            # add -- --impersonate to browse without a wallet

# terminal 3 — the app
npm run dev                    # http://localhost:3000
```

`anvil:setup` deploys `AlloDualClaim`, seeds every token value, has the Safe wrap ETH into WETH and approve the contract, registers demo projects, then **writes `NEXT_PUBLIC_CLAIM_ADDRESS` and `NEXT_PUBLIC_CLAIM_DEPLOY_BLOCK` into `.env.local`**. Those are `NEXT_PUBLIC_*` vars, so **restart `npm run dev`** afterwards — the dev server inlines them at build time and won't pick up the change on its own.

### Connecting

By default you connect a **real wallet** through ConnectKit — add the fork to it as a network (RPC `http://127.0.0.1:8545`, chain id `31337`).

To browse without a wallet, enable **impersonation**: run `npm run anvil:setup -- --impersonate` (writes `NEXT_PUBLIC_IMPERSONATE=<richest real holder>`) or set `NEXT_PUBLIC_IMPERSONATE` to any address yourself — e.g. `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (the local contract owner) to reach the admin console. The mock connector then signs nothing; anvil's `--auto-impersonate` executes the transactions. Clear the variable and restart `npm run dev` to go back to a real wallet. Impersonation is ignored when `NEXT_PUBLIC_CHAIN=mainnet`.

### Database (optional locally)

Without `DATABASE_URL` the send-off route appends to `data/sendoff-messages.jsonl` and everything else works. For the real path:

```bash
docker run -d --name allominati-pg -p 54329:5432 \
  -e POSTGRES_PASSWORD=allominati -e POSTGRES_DB=allominati postgres:17-alpine
npm run db:migrate             # prisma migrate dev
```

The `DATABASE_URL` in `.env.example` already matches that container. Prisma reads `.env.local` first, then `.env` (see `prisma.config.ts`) — same precedence as Next.js.

### Tests

```bash
npm run forge:test             # contract tests, on a mainnet fork
npm run e2e                    # headless claim flow + on-chain asserts
```

`e2e` drives the mock connector, so it requires `npm run anvil:setup -- --impersonate` and a dev server running against the resulting `.env.local`. Screenshots land in `.e2e-shots/` (gitignored). Override targets with `APP_URL` / `SHOT_DIR`.

## Environment variables

`NEXT_PUBLIC_*` values are **inlined into the browser bundle at build time**. Whatever is set when `next build` runs is frozen into the artifact — changing them later requires a rebuild, not a restart. Everything else is read at runtime on the server.

| Variable | Used by | Notes |
| --- | --- | --- |
| `ETH_RPC_URL` | anvil fork, `forge:test`, `derive`, send-off verification on mainnet | Use a keyed provider; public endpoints rate-limit hard |
| `NEXT_PUBLIC_CHAIN` | app | `local` (default) or `mainnet` |
| `NEXT_PUBLIC_RPC_URL` | browser | RPC when `NEXT_PUBLIC_CHAIN=mainnet` |
| `NEXT_PUBLIC_FORK_RPC_URL` | browser, `e2e` | Fork RPC when `NEXT_PUBLIC_CHAIN=local`; defaults to `http://127.0.0.1:8545` |
| `NEXT_PUBLIC_CLAIM_ADDRESS` | app | Written by `anvil:setup` locally; set by hand for mainnet |
| `NEXT_PUBLIC_CLAIM_DEPLOY_BLOCK` | terminal page | Lower bound for log scans. Written by `anvil:setup`. **Set it on mainnet** — without it the scan falls back to `earliest` and providers reject the range |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | app | Placeholder is fine locally; use a real Cloud id in production |
| `NEXT_PUBLIC_IMPERSONATE` | app | Dev only, local fork only |
| `DATABASE_URL` | send-off route, Prisma CLI | Optional locally (jsonl fallback), **required on mainnet** — the route returns 500 without it |
| `CLAIM_OWNER`, `CLAIM_CLOSES_AT` | `Deploy.s.sol` | Deploy-time only |
| `RPC_URL` | `anvil:setup`, `e2e` | Point the scripts at a hosted fork instead of localhost |
| `APP_URL`, `SHOT_DIR` | `e2e` | Default to `http://localhost:3000` and `.e2e-shots/` |

## Production

Two independent halves: the contract on mainnet, and the Next.js app on a host. Deploy the contract first — the app needs its address at build time.

### 1. Deploy the contract

1. `npm run derive` — fresh values; aborts if the Safe's ETH + WETH no longer covers the pool.
2. ```bash
   cd contracts && CLAIM_OWNER=0x... CLAIM_CLOSES_AT=<unix ts> \
     forge script script/Deploy.s.sol:Deploy \
     --rpc-url $ETH_RPC_URL --broadcast --private-key $DEPLOYER_KEY --verify
   ```
   One broadcast deploys, seeds all values from `data/token-values.json`, and transfers ownership to `CLAIM_OWNER`. The redemption window is 1 month: set `CLAIM_CLOSES_AT` to now + 30 days (extendable later via `extendWindow`, never shortenable).
3. The Safe funds the pool: wrap `totalSeeded()` into WETH (`deposit`), then `approve` the deployed address for exactly that amount. **The approval is the go-live switch** — no Safe module involved, and revoking the allowance shuts claims down. The admin console's pool-funding panel tracks both steps live and prints the exact `to`/`value`/`data` to run from the Safe UI (it only sends them itself when the connected wallet *is* the Safe, or on the local fork).
4. Record the deployed address and its deploy block for the next step.

> Values are pro-rated: 7.5 ETH of the 17.32 ETH mint proceeds was spent, so every token redeems ~56.7% of its mint price and the seeded total (~9.8238 WETH) is fully covered by the approved allowance — every claim is payable, first to last. Claims stay open until `closesAt`; after that the Safe revokes the WETH allowance — unclaimed value never left the Safe.

### 2. Run the app

Any Node host works (`next build` + `next start`; the bundled deploying guide also covers Docker and platform adapters). Set the full environment **before building**:

```bash
NEXT_PUBLIC_CHAIN=mainnet
NEXT_PUBLIC_CLAIM_ADDRESS=0x...              # from step 1
NEXT_PUBLIC_CLAIM_DEPLOY_BLOCK=<block>       # from step 1
NEXT_PUBLIC_RPC_URL=https://...              # keyed provider
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...     # real Cloud id
ETH_RPC_URL=https://...                      # server-side signature verification
DATABASE_URL=postgresql://...                # required — no jsonl fallback on mainnet
```

Then:

```bash
bun install --frozen-lockfile   # bun.lock is the committed lockfile; `npm ci` has
                                # nothing to read — use `npm install` if not on bun
npm run db:deploy       # prisma migrate deploy — never `migrate dev` in production
npm run build
npm run start           # PORT or -p to change the port; -H for the hostname
```

Leave `NEXT_PUBLIC_IMPERSONATE` unset. It's ignored when `NEXT_PUBLIC_CHAIN=mainnet`, but an unset variable is one less thing to get wrong.

Rebuild — not just restart — after changing any `NEXT_PUBLIC_*` value. If you promote a prebuilt image between environments, the values baked in at build time travel with it.

### 3. Hosted demo fork (optional)

To demo against a fork instead of mainnet, `docker/anvil/` deploys the same anvil fork to Railway; `docker/anvil/README.md` has the deploy steps, the volume setup that persists chain state, and the security caveat (**the endpoint is publicly writable — treat the URL as a secret**). Bootstrap it once with `RPC_URL=https://<service>.up.railway.app npm run anvil:setup`, then build the app with `NEXT_PUBLIC_CHAIN=local` and `NEXT_PUBLIC_FORK_RPC_URL` pointed at the same URL.

## Troubleshooting

- **App or `e2e` hitting the wrong chain.** A leftover `NEXT_PUBLIC_FORK_RPC_URL` in `.env.local` (from a hosted-fork session) silently overrides local anvil for both the app and the e2e asserts — the symptom is stale balances or a contract that "doesn't exist". Clear it to fall back to `http://127.0.0.1:8545`.
- **Changed `.env.local` and nothing happened.** `NEXT_PUBLIC_*` vars are inlined; restart `npm run dev`, or rebuild in production.
- **`forge build` fails on missing imports.** Submodules aren't checked out: `git submodule update --init --recursive`.
- **Claim address stopped working locally.** The fork was reset (anvil restarted without `--state`, or `anvil_reset`) — addresses change, so re-run `npm run anvil:setup` and restart the dev server.
- **`derive` or the fork is flaky.** The `publicnode` default rate-limits; set `ETH_RPC_URL` to a keyed provider.
- **Send-off rejected with a signature error.** Expected for hand-added impersonation addresses — only accounts `anvil:setup` etched the `DevSigner1271` shim onto can produce a verifiable signature. Use "continue to claim" to skip.
- **`e2e` aborts on a missing `.env.local` value.** It needs both `NEXT_PUBLIC_CLAIM_ADDRESS` and `NEXT_PUBLIC_IMPERSONATE`: `npm run anvil:setup -- --impersonate`, then restart the dev server.
