/**
 * End-to-end claim flow against the local anvil fork.
 *
 * Prereqs: `npm run anvil` + `npm run anvil:setup -- --impersonate` done
 * (the flow drives the mock connector, so impersonation must be enabled),
 * and the dev server running with the resulting .env.local (`npm run dev`).
 *
 * Drives a headless Chrome through: connect (mock) → portfolio → allocate
 * one refund + two investments → review + acks → sign → processing →
 * receipt, then asserts the on-chain outcome: redeemed flags, exact WETH
 * pulled from the Safe, holder/payout WETH balances, and raised totals.
 */
import { chromium } from "playwright-core";
import { createPublicClient, formatEther, http, parseAbi, type Address } from "viem";
import { foundry } from "viem/chains";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? join(root, ".e2e-shots");

function envOpt(name: string, file = ".env.local"): string | null {
  const p = join(root, file);
  if (!existsSync(p)) return null;
  const match = readFileSync(p, "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

function env(name: string): string {
  const value = envOpt(name);
  if (!value) throw new Error(`${name} missing from .env.local — run: npm run anvil:setup -- --impersonate (then restart the dev server)`);
  return value;
}

// Assert against the same fork the app itself targets (local or hosted).
const RPC = process.env.RPC_URL ?? envOpt("NEXT_PUBLIC_FORK_RPC_URL") ?? "http://127.0.0.1:8545";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const claimAbi = parseAbi([
  "function redeemed(uint256) view returns (bool)",
  "function tokenValue(uint256) view returns (uint256)",
  "function getProject(uint256) view returns ((string name, string tag, string description, address payout, uint256 raised, bool active))",
  "function available() view returns (uint256)",
  "function treasury() view returns (address)",
]);
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address;
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

async function main() {
  const CLAIM = env("NEXT_PUBLIC_CLAIM_ADDRESS") as Address;
  const HOLDER = env("NEXT_PUBLIC_IMPERSONATE") as Address;
  mkdirSync(SHOT_DIR, { recursive: true });

  const client = createPublicClient({ chain: foundry, transport: http(RPC) });
  const values = JSON.parse(readFileSync(join(root, "contracts/data/token-values.json"), "utf8")) as Record<string, string>;

  // Pick three unredeemed seeded tokens owned by the holder (ascending ids).
  const nftAbi = parseAbi(["function ownerOf(uint256) view returns (address)"]);
  const picks: bigint[] = [];
  for (const [idStr, v] of Object.entries(values)) {
    if (v === "0" || picks.length >= 3) continue;
    const id = BigInt(idStr);
    const owner = await client.readContract({ address: "0xcCf223a3Bb40173E1AB9262ad0d04C5bf3Ea32f5", abi: nftAbi, functionName: "ownerOf", args: [id] });
    if (owner.toLowerCase() !== HOLDER.toLowerCase()) continue;
    if (await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "redeemed", args: [id] })) continue;
    picks.push(id);
  }
  assert(picks.length === 3, `need 3 claimable tokens for holder ${HOLDER}`);
  const [refundId, investAId, investBId] = picks;
  const val = (id: bigint) => BigInt(values[id.toString()]);
  const refundWei = val(refundId);
  const investAWei = val(investAId);
  const investBWei = val(investBId);

  const wethOf = (addr: Address) =>
    client.readContract({ address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
  const SAFE = await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "treasury" });
  const poolBefore = await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "available" });
  const safeBefore = await wethOf(SAFE);
  const holderBefore = await wethOf(HOLDER);
  const projABefore = await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "getProject", args: [1n] });
  const projBBefore = await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "getProject", args: [2n] });
  const payoutABefore = await wethOf(projABefore.payout);
  const payoutBBefore = await wethOf(projBBefore.payout);

  console.log(`claiming: #${refundId} → refund (${formatEther(refundWei)} WETH), #${investAId} → ${projABefore.name}, #${investBId} → ${projBBefore.name}`);

  // ---- drive the browser ----
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  const shot = (name: string) => page.screenshot({ path: join(SHOT_DIR, `${name}.png`) });

  await page.goto(APP_URL);
  await page.waitForSelector("text=Take your money back");
  await page.click("button:has-text('Connect wallet')");
  await page.waitForSelector("text=YOUR POSITION", { timeout: 30000 });
  await page.waitForSelector("text=REDEEMABLE VALUE");
  await shot("01-portfolio");

  // Portfolio should show the picked tokens with their derived values.
  for (const id of picks) {
    assert(await page.locator(`span:text("#${id}")`).count() > 0, `portfolio shows token #${id}`);
  }

  await page.click("button:has-text('Build your claim')");
  await page.waitForSelector("text=Allocate your NFTs");

  // Refund is the default active destination.
  await page.click(`span:text("#${refundId}")`);
  await page.click(`text=${projABefore.name}`);
  await page.click(`span:text("#${investAId}")`);
  await page.click(`text=${projBBefore.name}`);
  await page.click(`span:text("#${investBId}")`);
  await shot("02-allocate");

  // Send-off step: leave a message for kevin, then continue to review.
  await page.click("button:has-text('Review claim')");
  await page.waitForSelector("text=say something back");
  const sendoffMessage = `e2e send-off ${Date.now()}: thanks for the journey`;
  await page.fill("#sendoff-message", sendoffMessage);
  await shot("03-sendoff");
  await page.click("button:has-text('ship it')");

  await page.waitForSelector("text=Review your claim");
  await page.click("text=I understand redemption is permanent");
  await page.click("text=I accept the risks of these projects.");
  await shot("04-review");

  await page.click("button:has-text('Sign & confirm claim')");
  await page.waitForSelector("text=Processing your claim");
  await shot("05-processing");

  await page.waitForSelector("text=Claim complete", { timeout: 30000 });
  await shot("06-receipt");
  const txText = await page.locator("span[title^='0x'], a[href*='/tx/']").first().getAttribute("title");
  assert(txText && txText.startsWith("0x") && txText.length === 66, `receipt shows a real tx hash (got ${txText})`);

  await page.click("button:has-text('Back to portfolio')");
  await page.waitForSelector("text=YOUR POSITION");
  await page.waitForSelector("text=excluded");
  // The redeemed tokens drop out of the claimable grid once the invalidated
  // queries refetch — poll for the disappearance instead of sampling once,
  // since hosted forks answer slowly enough to show the stale grid first.
  for (const id of picks) {
    await page.waitForSelector(`span:text("#${id}")`, { state: "detached", timeout: 30000 });
  }
  await shot("07-portfolio-after");
  await browser.close();
  assert(consoleErrors.length === 0, `no page errors (got: ${consoleErrors.join(" | ")})`);

  // The shipped send-off message must have been persisted by the API route:
  // to Postgres when DATABASE_URL is configured, else the local-dev jsonl.
  // Impersonated sessions sign with the anvil dev key (verified through the
  // holder's DevSigner1271 shim), so a signature is always recorded.
  const dbUrl = process.env.DATABASE_URL ?? envOpt("DATABASE_URL", ".env") ?? envOpt("DATABASE_URL");
  if (dbUrl) {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { PrismaClient } = await import("../app/generated/prisma/client");
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
    const row = await prisma.sendoffMessage.findFirst({ where: { message: sendoffMessage } });
    await prisma.$disconnect();
    assert(row, "send-off message persisted to postgres");
    assert(row!.address === HOLDER.toLowerCase(), "send-off row records the holder address");
    assert(row!.signature?.startsWith("0x"), "send-off row carries the verified signature");
  } else {
    const sendoffLog = readFileSync(join(root, "data/sendoff-messages.jsonl"), "utf8");
    assert(sendoffLog.includes(JSON.stringify(sendoffMessage)), "send-off message persisted to data/sendoff-messages.jsonl");
  }

  // ---- on-chain assertions ----
  for (const id of picks) {
    assert(await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "redeemed", args: [id] }), `redeemed(${id})`);
  }
  const claimedTotal = refundWei + investAWei + investBWei;
  const poolAfter = await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "available" });
  assert(poolAfter === poolBefore - claimedTotal, `pool deducted exactly ${formatEther(claimedTotal)} WETH (before ${formatEther(poolBefore)}, after ${formatEther(poolAfter)})`);
  const safeAfter = await wethOf(SAFE);
  assert(safeAfter === safeBefore - claimedTotal, `Safe debited exactly ${formatEther(claimedTotal)} WETH`);
  assert((await wethOf(CLAIM)) === 0n, "contract holds no WETH");

  const holderAfter = await wethOf(HOLDER);
  assert(holderAfter === holderBefore + refundWei, `holder received exactly ${formatEther(refundWei)} WETH`);

  const projA = await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "getProject", args: [1n] });
  const projB = await client.readContract({ address: CLAIM, abi: claimAbi, functionName: "getProject", args: [2n] });
  assert(projA.raised === projABefore.raised + investAWei, `project 1 raised += ${formatEther(investAWei)}`);
  assert(projB.raised === projBBefore.raised + investBWei, `project 2 raised += ${formatEther(investBWei)}`);
  assert((await wethOf(projA.payout)) === payoutABefore + investAWei, "payout A received exactly");
  assert((await wethOf(projB.payout)) === payoutBBefore + investBWei, "payout B received exactly");

  console.log("\n✓ E2E claim flow passed");
  console.log(`  refund:   ${formatEther(refundWei)} WETH → holder`);
  console.log(`  invested: ${formatEther(investAWei)} WETH → ${projA.name}, ${formatEther(investBWei)} WETH → ${projB.name}`);
  console.log(`  pool:     ${formatEther(poolBefore)} → ${formatEther(poolAfter)} WETH (pulled from the Safe)`);
  console.log(`  screenshots in ${SHOT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
