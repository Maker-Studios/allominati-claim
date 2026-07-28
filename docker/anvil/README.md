# Hosted anvil fork (Railway)

Runs the same anvil mainnet fork as `npm run anvil`, but on Railway so the
demo frontend can be used without a local node.

## Deploy

1. Create a new Railway service from this repo. The root `railway.toml`
   points the build at `docker/anvil/Dockerfile`.
2. Set variables on the service:
   - `ETH_RPC_URL` — a keyed mainnet RPC (Alchemy/Infura free tier).
     Public endpoints rate-limit datacenter IPs hard; don't rely on the
     publicnode default.
   - `FORK_BLOCK_NUMBER` — recommended. Pin a recent block so restarts are
     deterministic and anvil's fork cache stays valid.
3. Attach a volume mounted at `/data`. The entrypoint detects it and runs
   anvil with `--state /data/anvil-state.json`, so deployed contracts and
   seeded values survive restarts. Without a volume, every restart wipes
   the fork.
4. Generate a public domain, target port `8545` (or whatever `PORT` Railway
   injected). The resulting `https://…up.railway.app` URL serves JSON-RPC
   over HTTP and WebSocket.

## Point the app at it

Both the app and the setup script are already env-driven, each defaulting to
`http://127.0.0.1:8545`:

- the app reads `NEXT_PUBLIC_FORK_RPC_URL` (`app/lib/onchain/addresses.ts`,
  consumed by `wagmi.ts`, `hooks.ts`, and the send-off route) — note this is a
  *different* variable from `NEXT_PUBLIC_RPC_URL`, which is only used when
  `NEXT_PUBLIC_CHAIN=mainnet`;
- `scripts/setup-anvil.ts` and `scripts/e2e-claim.ts` read `RPC_URL`.

Bootstrap the hosted fork once from your machine:

```sh
npm run forge:build && npm run derive
RPC_URL=https://<service>.up.railway.app npm run anvil:setup
```

Passing `RPC_URL` also makes the script write `NEXT_PUBLIC_FORK_RPC_URL` into
your local `.env.local` — handy for pointing local dev at the hosted fork, but
remember to clear it when you go back to local anvil, or the app and `npm run
e2e` will keep talking to Railway.

Wherever the frontend is deployed, build it with `NEXT_PUBLIC_CHAIN=local`,
`NEXT_PUBLIC_FORK_RPC_URL=https://<service>.up.railway.app`, and the
`NEXT_PUBLIC_CLAIM_ADDRESS` + `NEXT_PUBLIC_CLAIM_DEPLOY_BLOCK` values the setup
script prints (optionally `NEXT_PUBLIC_IMPERSONATE` to demo without a wallet).
These are inlined at build time, so changing them needs a rebuild.

## Caveats

- **The endpoint is publicly writable.** `--auto-impersonate` plus anvil's
  `anvil_*` cheatcode methods mean anyone with the URL can send
  transactions as any address or mutate fork state. It's fork-only fake
  money, but a demo can be griefed — treat the URL as a secret, or front
  it with a reverse proxy that checks a token.
- After a state wipe (volume removed, `anvil_reset`), re-run
  `anvil:setup` — contract addresses will change.
