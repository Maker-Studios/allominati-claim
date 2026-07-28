/**
 * Give every AlloPatronNFT holder 1 ETH of gas on the anvil fork so real
 * wallets can test the claim flow without topping up manually.
 *
 * Adds 1 ETH to each unique owner's current balance via anvil_setBalance
 * (dev fork only — this RPC method doesn't exist on real mainnet).
 *
 * Run: RPC_URL=https://rpc-node-production.up.railway.app npx tsx scripts/fund-holders.ts
 */
import { createPublicClient, formatEther, http, parseAbi, parseEther, type Address } from "viem";
import { foundry } from "viem/chains";

const NFT: Address = "0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const TOP_UP = parseEther("1");

const nftAbi = parseAbi([
  "function counter() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
]);

async function main() {
  const pub = createPublicClient({
    chain: {
      ...foundry,
      contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as Address } },
    },
    transport: http(RPC),
  });

  const counter = await pub.readContract({ address: NFT, abi: nftAbi, functionName: "counter" });
  const ids = Array.from({ length: Number(counter) }, (_, i) => BigInt(i + 1));
  const owners = await pub.multicall({
    contracts: ids.map((id) => ({ address: NFT, abi: nftAbi, functionName: "ownerOf" as const, args: [id] })),
    allowFailure: false,
  });
  const holders = [...new Set((owners as Address[]).map((o) => o.toLowerCase() as Address))];
  console.log(`${holders.length} unique holders across ${counter} tokens on ${RPC}`);

  for (const holder of holders) {
    const balance = await pub.getBalance({ address: holder });
    await pub.request({
      method: "anvil_setBalance" as never,
      params: [holder, `0x${(balance + TOP_UP).toString(16)}`] as never,
    });
    console.log(`  ${holder}  ${formatEther(balance)} → ${formatEther(balance + TOP_UP)} ETH`);
  }
  console.log(`✓ funded ${holders.length} holders with +1 ETH each`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
