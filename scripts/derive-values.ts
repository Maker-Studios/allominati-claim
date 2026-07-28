/**
 * Derive each AlloPatronNFT tokenId's paid mint price by replaying the
 * bonding curve against the mint history, and write
 * contracts/data/token-values.json for seeding AlloDualClaim.
 *
 * Curve (from verified source): price starts at basePrice and advances
 * price = price * 1013370 / 1e6 after EVERY paid mint (per token, including
 * within a batch). Admin `mintTo` mints pay nothing and do NOT advance the
 * curve; those tokens get value 0 (owner can override on-chain later).
 *
 * Every paid batch is checksummed against its TokensMinted.price event and
 * the final state is cross-checked against live counter() and price() —
 * any mismatch aborts instead of writing wrong values.
 *
 * Values are then pro-rated: the Safe is short exactly SHORTFALL of the full
 * mint liability, so each token redeems value * (totalPaid - SHORTFALL) /
 * totalPaid. The shortfall (not the balance) is hardcoded so the output is
 * deterministic — top-ups only add buffer, and new paid mints (which add
 * their full price to both sides) keep the ratio consistent.
 */
import { createPublicClient, http, formatEther, parseAbi, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NFT = "0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5" as const;
const SAFE = "0x82105Ebf24D92A5F4879789B11116f64D941F719" as const;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const NFT_DEPLOY_BLOCK = 21931482n;
const BASE_PRICE = 42069000000000000n; // constructor basePrice (0.042069 ETH)
const MULTIPLIER = 1013370n;
const PRECISION = 1000000n;

// ETH that left the Safe and isn't coming back (snapshot 2026-07-08). The
// live balance is only asserted against this, never used as an input.
const SHORTFALL = 7_500_000_000_000_000_000n;

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOKENS_MINTED_TOPIC = "0x2e8ac5177a616f2aec08c3048f5021e4e9743ece034e8d83ba5caf76688bb475";

const RPC_URL = process.env.ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com";

interface RawLog {
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  topics: string[];
  data: string;
}

async function fetchLogs(): Promise<RawLog[]> {
  // Public RPCs refuse archival getLogs ranges; Blockscout serves the full
  // history (277 logs total) in one paginated call.
  const url =
    `https://eth.blockscout.com/api?module=logs&action=getLogs&address=${NFT}` +
    `&fromBlock=${NFT_DEPLOY_BLOCK}&toBlock=99999999`;
  const res = await fetch(url);
  const body = (await res.json()) as { status: string; message: string; result: RawLog[] };
  if (body.status !== "1") throw new Error(`Blockscout log fetch failed: ${body.message}`);
  return body.result;
}

async function main() {
  const client = createPublicClient({ chain: mainnet, transport: http(RPC_URL) });
  const logs = await fetchLogs();

  // Sort chronologically and group by transaction.
  const sorted = logs
    .map((l) => ({ ...l, block: BigInt(l.blockNumber), index: l.logIndex === "0x" ? 0n : BigInt(l.logIndex) }))
    .sort((a, b) => (a.block === b.block ? Number(a.index - b.index) : Number(a.block - b.block)));

  const txOrder: string[] = [];
  const byTx = new Map<string, { mints: { tokenId: bigint; to: string }[]; paidTotal: bigint | null }>();
  for (const log of sorted) {
    let entry = byTx.get(log.transactionHash);
    if (!entry) {
      entry = { mints: [], paidTotal: null };
      byTx.set(log.transactionHash, entry);
      txOrder.push(log.transactionHash);
    }
    if (log.topics[0] === TRANSFER_TOPIC) {
      const from = `0x${log.topics[1].slice(26)}`;
      if (from !== zeroAddress) throw new Error(`Non-mint transfer found in ${log.transactionHash} — NFT should be soulbound`);
      entry.mints.push({ tokenId: BigInt(log.topics[3]), to: `0x${log.topics[2].slice(26)}` });
    } else if (log.topics[0] === TOKENS_MINTED_TOPIC) {
      // TokensMinted(address indexed to, uint256 price, uint256 count) — price is the batch total paid.
      entry.paidTotal = BigInt(log.data.slice(0, 66));
    }
  }

  // Replay the curve.
  let price = BASE_PRICE;
  const values = new Map<bigint, bigint>();
  let paidCount = 0;
  let adminCount = 0;
  let totalPaid = 0n;

  for (const hash of txOrder) {
    const { mints, paidTotal } = byTx.get(hash)!;
    if (mints.length === 0) continue; // Initialized / TokenGroupAdded / Ownership txs
    if (paidTotal !== null) {
      let batchSum = 0n;
      for (const m of mints) {
        values.set(m.tokenId, price);
        batchSum += price;
        totalPaid += price;
        price = (price * MULTIPLIER) / PRECISION;
        paidCount++;
      }
      if (batchSum !== paidTotal) {
        throw new Error(`Batch sum mismatch in ${hash}: replayed ${batchSum}, event says ${paidTotal}`);
      }
    } else {
      for (const m of mints) {
        values.set(m.tokenId, 0n);
        adminCount++;
      }
    }
  }

  // Cross-check replayed end state against the live contract.
  const nftAbi = parseAbi([
    "function counter() view returns (uint256)",
    "function price() view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
  ]);
  // Redemptions are paid in WETH pulled from the Safe; count both what's
  // already wrapped and the ETH still to be wrapped when checking coverage.
  const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
  const [liveCounter, livePrice, safeEth, safeWeth] = await Promise.all([
    client.readContract({ address: NFT, abi: nftAbi, functionName: "counter" }),
    client.readContract({ address: NFT, abi: nftAbi, functionName: "price" }),
    client.getBalance({ address: SAFE }),
    client.readContract({ address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [SAFE] }),
  ]);
  const safeBalance = safeEth + safeWeth;
  if (BigInt(values.size) !== liveCounter) {
    throw new Error(`Token count mismatch: replayed ${values.size}, live counter ${liveCounter}`);
  }
  if (price !== livePrice) {
    throw new Error(`Final curve price mismatch: replayed ${price}, live ${livePrice}`);
  }

  // Pro-rate every value to the pool the Safe can cover. Flooring each token
  // individually guarantees the seeded total never exceeds the pool.
  const pool = totalPaid - SHORTFALL;
  if (safeBalance < pool) {
    throw new Error(
      `Safe balance ${formatEther(safeBalance)} ETH+WETH is below the pro-rata pool ` +
        `${formatEther(pool)} ETH — shortfall grew beyond ${formatEther(SHORTFALL)} ETH, refusing to seed`,
    );
  }
  let seededTotal = 0n;
  for (const [id, v] of values) {
    const scaled = (v * pool) / totalPaid;
    values.set(id, scaled);
    seededTotal += scaled;
  }

  // Owner census (for the impersonation suggestion) via multicall.
  const tokenIds = [...values.keys()].sort((a, b) => Number(a - b));
  const owners = await client.multicall({
    contracts: tokenIds.map((id) => ({ address: NFT, abi: nftAbi, functionName: "ownerOf" as const, args: [id] })),
    allowFailure: false,
  });
  const holderPaidTokens = new Map<string, bigint[]>();
  tokenIds.forEach((id, i) => {
    if ((values.get(id) ?? 0n) === 0n) return;
    const owner = (owners[i] as string).toLowerCase();
    holderPaidTokens.set(owner, [...(holderPaidTokens.get(owner) ?? []), id]);
  });
  const [topHolder, topTokens] = [...holderPaidTokens.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "contracts", "data", "token-values.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(Object.fromEntries(tokenIds.map((id) => [id.toString(), (values.get(id) ?? 0n).toString()])), null, 2),
  );

  console.log(`✓ replayed ${values.size} mints (${paidCount} paid, ${adminCount} admin) — all batch checksums passed`);
  console.log(`✓ live cross-checks passed (counter=${liveCounter}, next price=${formatEther(livePrice)} ETH)`);
  console.log(`wrote ${outPath}`);
  console.log(`\nLiability report:`);
  console.log(`  total paid at mint (full liability):   ${formatEther(totalPaid)} ETH`);
  console.log(`  hardcoded shortfall:                   ${formatEther(SHORTFALL)} ETH`);
  console.log(`  pro-rata pool (paid - shortfall):      ${formatEther(pool)} ETH`);
  console.log(`  payout ratio:                          ${(Number((pool * 1_000_000n) / totalPaid) / 10_000).toFixed(4)}%`);
  console.log(`  seeded total (after per-token floor):  ${formatEther(seededTotal)} ETH`);
  console.log(`  Safe balance (covers pool: ${safeBalance >= pool ? "yes" : "NO"}):        ${formatEther(safeBalance)} ETH+WETH (${formatEther(safeWeth)} already wrapped)`);
  console.log(`  holders with paid tokens: ${holderPaidTokens.size}`);
  console.log(`\nSuggested dev impersonation holder (most paid tokens):`);
  console.log(`  ${topHolder} — ${topTokens.length} tokens: [${topTokens.join(", ")}]`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
