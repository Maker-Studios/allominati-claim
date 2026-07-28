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

The app and setup script currently hardcode `http://127.0.0.1:8545`. Make
the URL env-driven (falls back to localhost for local dev):

- `app/lib/onchain/wagmi.ts` and `app/lib/onchain/hooks.ts` (2 call sites):

  ```ts
  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
  // ... http(RPC_URL)
  ```

- `scripts/setup-anvil.ts`:

  ```ts
  const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  ```

Then bootstrap the hosted fork once from your machine:

```sh
npm run forge:build && npm run derive
RPC_URL=https://<service>.up.railway.app npm run anvil:setup
```

and set `NEXT_PUBLIC_RPC_URL=https://<service>.up.railway.app` (plus the
`NEXT_PUBLIC_CLAIM_ADDRESS` value the setup script prints, and optionally
`NEXT_PUBLIC_IMPERSONATE` to demo without a wallet) wherever the frontend
is deployed.

## Caveats

- **The endpoint is publicly writable.** `--auto-impersonate` plus anvil's
  `anvil_*` cheatcode methods mean anyone with the URL can send
  transactions as any address or mutate fork state. It's fork-only fake
  money, but a demo can be griefed — treat the URL as a secret, or front
  it with a reverse proxy that checks a token.
- After a state wipe (volume removed, `anvil_reset`), re-run
  `anvil:setup` — contract addresses will change.
