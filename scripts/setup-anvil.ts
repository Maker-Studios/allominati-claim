/**
 * Bootstrap a local anvil mainnet fork for frontend development:
 *  1. deploy AlloDualClaim (anvil account 0 = owner/admin, 1-month window)
 *  2. seed token values from contracts/data/token-values.json
 *  3. fund the pool: the Safe wraps exactly totalSeeded into WETH and
 *     approves the contract for it (txs sent FROM the Safe itself —
 *     requires `anvil --auto-impersonate`); the contract holds nothing
 *  4. register demo projects
 *  5. pick the richest real holder for browser impersonation and fund it
 *  6. etch the DevSigner1271 shim onto every impersonation account so the
 *     send-off signature flow verifies without their private keys
 *  7. write NEXT_PUBLIC_CLAIM_ADDRESS into .env.local
 *
 * By default the app connects a real wallet (RainbowKit). Pass --impersonate
 * to also write NEXT_PUBLIC_IMPERSONATE=<richest holder> so the app browses
 * as that account via the mock connector (required for `npm run e2e`).
 *
 * Prereqs: `npm run anvil` running, `npm run forge:build` done, `npm run derive` done.
 */
import { config } from "dotenv";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, type Address, type Hex } from "viem";
import { foundry as foundryBase } from "viem/chains";

// Pick up CLAIM_OWNER etc. from the env files (shell env still wins —
// dotenv never overwrites variables that are already set).
config({ path: [".env.local", ".env"], quiet: true });

// The fork carries mainnet state, so multicall3 exists — viem's stock
// `foundry` chain just doesn't declare it.
const foundry = {
  ...foundryBase,
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as Address } },
};
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NFT: Address = "0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5";
const SAFE: Address = "0x82105Ebf24D92A5F4879789B11116f64D941F719";
const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
// Local anvil by default; set RPC_URL to target a hosted fork (e.g. Railway).
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
// Opt-in: connect the app as the richest holder instead of a real wallet.
const WRITE_IMPERSONATE = process.argv.includes("--impersonate");

// Contract owner/admin — anvil default account 0 unless overridden. Set
// CLAIM_OWNER (shell env or .env.local) to your own wallet to drive the
// admin console with a real wallet connection; auto-impersonation signs
// its setup txs either way.
const OWNER: Address = (process.env.CLAIM_OWNER?.replace(/^["']|["']$/g, "") as Address) || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
// Fresh, code-less payout addresses. Do NOT use anvil's well-known accounts
// here: their keys are public, and on real mainnet (which the fork mirrors)
// they carry EIP-7702 sweeper delegations that instantly forward any ETH away.
const PAYOUTS: Address[] = [
  "0xa110000000000000000000000000000000000001",
  "0xa110000000000000000000000000000000000002",
  "0xa110000000000000000000000000000000000003",
  "0xa110000000000000000000000000000000000004",
];

// Impersonation picker defaults (app/lib/onchain/impersonation.tsx) — these
// get the DevSigner1271 shim etched so signed send-offs work for them too.
const PINNED_IMPERSONATION: Address[] = [
  "0x6Dc43be93a8b5Fd37dC16f24872BaBc6dA5E5e3E",
  "0x285e093e334A4aD3D1f37c5E8F8B5761eD0CF1f7",
  "0xF362a9d7bA3E2ff709F27d78C0545533763D06c1",
];

const DEMO_PROJECTS = [
  { name: "Helios Solar Microgrid", tag: "Energy", description: "Decentralized solar microgrids powering 12 off-grid communities in East Africa." },
  { name: "Meridian Lending Pool", tag: "DeFi", description: "Over-collateralized stablecoin lending vault. Audited by Trail of Bits." },
  { name: "Aperture Film Fund", tag: "Media", description: "Tokenized financing for three independent feature films with revenue share." },
  { name: "Tidewater Carbon", tag: "Climate", description: "Blue-carbon mangrove restoration generating verified offset credits." },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const claimAbi = parseAbi([
  "function setTokenValues(uint256[] tokenIds, uint256[] values)",
  "function registerProject(string name, string tag, string description, address payout) returns (uint256)",
  "function projectCount() view returns (uint256)",
  "function totalSeeded() view returns (uint256)",
  "function closesAt() view returns (uint256)",
]);
const nftAbi = parseAbi(["function ownerOf(uint256) view returns (address)"]);
const wethAbi = parseAbi([
  "function deposit() payable",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

// value null removes the line entirely (used to scrub retired keys).
function upsertEnv(path: string, entries: Record<string, string | null>) {
  let text = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [key, value] of Object.entries(entries)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (value === null) {
      text = text.replace(new RegExp(`^${key}=.*\\n?`, "m"), "");
      continue;
    }
    const line = `${key}=${value}`;
    text = re.test(text) ? text.replace(re, line) : text + (text.endsWith("\n") || !text ? "" : "\n") + line + "\n";
  }
  writeFileSync(path, text);
}

async function main() {
  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  const wallet = (account: Address) => createWalletClient({ account, chain: foundry, transport: http(RPC) });

  // The owner sends every setup tx — give it gas if it isn't a pre-funded
  // anvil account (e.g. a real wallet passed via CLAIM_OWNER).
  if ((await pub.getBalance({ address: OWNER })) < parseEther("1")) {
    await pub.request({ method: "anvil_setBalance" as never, params: [OWNER, "0x8AC7230489E80000"] as never }); // 10 ETH
    console.log(`✓ funded owner ${OWNER} with 10 ETH gas`);
  }

  // 1. deploy from the forge artifact with a 1-month claim window
  const artifact = JSON.parse(readFileSync(join(root, "contracts/out/AlloDualClaim.sol/AlloDualClaim.json"), "utf8"));
  const closesAt = (await pub.getBlock()).timestamp + 30n * 86400n;
  const deployHash = await wallet(OWNER).deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as Hex,
    args: [NFT, WETH, SAFE, OWNER, closesAt],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const claim = receipt.contractAddress;
  if (!claim) throw new Error("deployment failed");
  console.log(`✓ AlloDualClaim deployed at ${claim} (owner = ${OWNER}, window closes ${new Date(Number(closesAt) * 1000).toISOString()})`);

  // 2. seed token values in chunks
  const valuesJson = JSON.parse(readFileSync(join(root, "contracts/data/token-values.json"), "utf8")) as Record<string, string>;
  const entries = Object.entries(valuesJson).filter(([, v]) => v !== "0");
  const CHUNK = 100;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const hash = await wallet(OWNER).writeContract({
      address: claim, abi: claimAbi, functionName: "setTokenValues",
      args: [chunk.map(([id]) => BigInt(id)), chunk.map(([, v]) => BigInt(v))],
    });
    await pub.waitForTransactionReceipt({ hash });
  }
  const seeded = await pub.readContract({ address: claim, abi: claimAbi, functionName: "totalSeeded" });
  console.log(`✓ seeded ${entries.length} token values (total liability ${Number(seeded) / 1e18} ETH)`);

  // 3. fund the pool: the Safe wraps exactly totalSeeded into WETH and
  // approves the contract for it — claims pull straight from the Safe.
  // Dev-fork only: prior test claims may have drained the fork's Safe, and the
  // impersonated txs make the Safe pay its own gas (on real mainnet the
  // executing owner's EOA pays) — top it up so funding always succeeds.
  const gasBuffer = parseEther("0.05");
  const wethHeld = await pub.readContract({ address: WETH, abi: wethAbi, functionName: "balanceOf", args: [SAFE] });
  const toWrap = wethHeld >= seeded ? 0n : seeded - wethHeld;
  if ((await pub.getBalance({ address: SAFE })) < toWrap + gasBuffer) {
    await pub.request({
      method: "anvil_setBalance" as never,
      params: [SAFE, `0x${(toWrap + gasBuffer).toString(16)}`] as never,
    });
    console.log("  (dev fork: topped up Safe to cover pool + gas)");
  }
  if (toWrap > 0n) {
    const wrapHash = await wallet(SAFE).writeContract({
      address: WETH, abi: wethAbi, functionName: "deposit", value: toWrap,
    });
    await pub.waitForTransactionReceipt({ hash: wrapHash });
  }
  const approveHash = await wallet(SAFE).writeContract({
    address: WETH, abi: wethAbi, functionName: "approve", args: [claim, seeded],
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });
  const allowance = await pub.readContract({ address: WETH, abi: wethAbi, functionName: "allowance", args: [SAFE, claim] });
  if (allowance < seeded) throw new Error(`pool underfunded: allowance ${allowance} < ${seeded}`);
  console.log(`✓ pool funded: Safe wrapped + approved ${Number(seeded) / 1e18} WETH for the contract (impersonated txs)`);

  // 4. register demo projects
  for (let i = 0; i < DEMO_PROJECTS.length; i++) {
    const p = DEMO_PROJECTS[i];
    const hash = await wallet(OWNER).writeContract({
      address: claim, abi: claimAbi, functionName: "registerProject",
      args: [p.name, p.tag, p.description, PAYOUTS[i]],
    });
    await pub.waitForTransactionReceipt({ hash });
  }
  console.log(`✓ registered ${DEMO_PROJECTS.length} demo projects (count = ${await pub.readContract({ address: claim, abi: claimAbi, functionName: "projectCount" })})`);

  // 5. impersonation holder: most paid tokens, verified as current owner on the fork
  const byHolder = new Map<string, number>();
  const ids = entries.map(([id]) => BigInt(id));
  const owners = await pub.multicall({
    contracts: ids.map((id) => ({ address: NFT, abi: nftAbi, functionName: "ownerOf" as const, args: [id] })),
    allowFailure: false,
  });
  owners.forEach((o) => byHolder.set(o as string, (byHolder.get(o as string) ?? 0) + 1));
  const [holder, count] = [...byHolder.entries()].sort((a, b) => b[1] - a[1])[0];
  await pub.request({ method: "anvil_setBalance" as never, params: [holder, "0x8AC7230489E80000"] as never }); // 10 ETH
  console.log(`✓ impersonation holder ${holder} (${count} paid tokens) funded with 10 ETH gas`);

  // 6. impersonated accounts can't sign (no key), so etch the dev ERC-1271
  // shim onto them: the app signs send-offs with anvil dev key 0 and the
  // backend's signature verification accepts it via isValidSignature.
  const shim = JSON.parse(
    readFileSync(join(root, "contracts/out/DevSigner1271.sol/DevSigner1271.json"), "utf8"),
  ).deployedBytecode.object as Hex;
  const signerAccounts = [...new Set([holder as Address, ...PINNED_IMPERSONATION])];
  for (const account of signerAccounts) {
    await pub.request({ method: "anvil_setCode" as never, params: [account, shim] as never });
  }
  console.log(`✓ etched DevSigner1271 onto ${signerAccounts.length} impersonation accounts (signed send-offs verify)`);

  // 7. write env
  upsertEnv(join(root, ".env.local"), {
    NEXT_PUBLIC_CHAIN: "local",
    NEXT_PUBLIC_CLAIM_ADDRESS: claim,
    // Lets the terminal start its log scan here instead of probing
    // anvil_metadata (a slow round-trip on hosted forks).
    NEXT_PUBLIC_CLAIM_DEPLOY_BLOCK: receipt.blockNumber.toString(),
    NEXT_PUBLIC_E2E: null, // retired flag — impersonation is now gated on NEXT_PUBLIC_IMPERSONATE
    // Only enable impersonation when explicitly asked; otherwise leave any
    // manually-set NEXT_PUBLIC_IMPERSONATE alone so real-wallet setups persist.
    ...(WRITE_IMPERSONATE ? { NEXT_PUBLIC_IMPERSONATE: holder } : {}),
    // When targeting a hosted fork, point the frontend at it too.
    ...(process.env.RPC_URL ? { NEXT_PUBLIC_FORK_RPC_URL: RPC } : {}),
  });
  if (WRITE_IMPERSONATE) {
    console.log(`✓ .env.local updated (NEXT_PUBLIC_CLAIM_ADDRESS, NEXT_PUBLIC_CHAIN=local, NEXT_PUBLIC_IMPERSONATE=${holder})`);
  } else {
    console.log("✓ .env.local updated (NEXT_PUBLIC_CLAIM_ADDRESS, NEXT_PUBLIC_CHAIN=local)");
    console.log("  Connect your real wallet: add the fork as a network (RPC " + RPC + ", chain id 31337).");
    console.log(`  To browse without a wallet instead, rerun with --impersonate or set NEXT_PUBLIC_IMPERSONATE=${holder}`);
  }
  console.log("\nNow run: npm run dev  (restart it if it was already running so env changes load)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
