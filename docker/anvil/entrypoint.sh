#!/bin/sh
# Runs the anvil mainnet fork for hosted (Railway) deployments.
#
# Env vars:
#   ETH_RPC_URL        upstream mainnet RPC (use a keyed provider — public
#                      endpoints rate-limit datacenter IPs aggressively)
#   FORK_BLOCK_NUMBER  optional; pin the fork so state is deterministic
#                      across restarts and the fork cache stays valid
#   PORT               injected by Railway; defaults to 8545
#
# Mount a volume at /data to persist chain state (deployed contracts,
# seeded values) across restarts. Without it, every restart resets the
# fork and the frontend's saved contract addresses go stale.
set -eu

: "${ETH_RPC_URL:=https://ethereum-rpc.publicnode.com}"
PORT="${PORT:-8545}"

set -- \
  --fork-url "$ETH_RPC_URL" \
  --auto-impersonate \
  --chain-id 31337 \
  --host 0.0.0.0 \
  --port "$PORT"

if [ -n "${FORK_BLOCK_NUMBER:-}" ]; then
  set -- "$@" --fork-block-number "$FORK_BLOCK_NUMBER"
fi

if [ -d /data ]; then
  # --state loads the file on boot if present, dumps on shutdown and
  # every --state-interval seconds (crash protection)
  set -- "$@" --state /data/anvil-state.json --state-interval 60
fi

exec anvil "$@"
