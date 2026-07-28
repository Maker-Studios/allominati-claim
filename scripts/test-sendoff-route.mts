/**
 * Direct tests for the /api/sendoff route: a validly signed submission is
 * verified and stored in Postgres, tampered/forged signatures are rejected,
 * and an unsigned submission is accepted only in local mode.
 *
 * Prereqs: dev server running, DATABASE_URL set (rows it creates are
 * cleaned up). Run: DATABASE_URL=... npx tsx scripts/test-sendoff-route.mts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { sendoffSignPayload } from "../app/lib/sendoff";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const APP = process.env.APP_URL ?? "http://localhost:3000";
// anvil dev account 9 — a throwaway key nobody uses for the claim flow
const signer = privateKeyToAccount("0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const post = (body: unknown) =>
  fetch(`${APP}/api/sendoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const message = `route test ${Date.now()}: signed and verified`;
const payload = sendoffSignPayload(signer.address, message);
const signature = await signer.signMessage({ message: payload });

// 1. valid signature → 200, stored with the signature
let res = await post({ address: signer.address, message, signature });
assert(res.status === 200, `valid signature accepted (got ${res.status})`);

// 2. tampered message under the same signature → 401
res = await post({ address: signer.address, message: message + " (tampered)", signature });
assert(res.status === 401, `tampered message rejected (got ${res.status})`);

// 3. wrong signer for the payload → 401
const stranger = privateKeyToAccount("0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97");
const forged = await stranger.signMessage({ message: payload });
res = await post({ address: signer.address, message, signature: forged });
assert(res.status === 401, `wrong-signer signature rejected (got ${res.status})`);

// 4. unsigned → rejected everywhere, signatures are unconditional
const unsignedMessage = `route test ${Date.now()}: unsigned submission`;
res = await post({ address: signer.address, message: unsignedMessage });
assert(res.status === 401, `unsigned rejected (got ${res.status})`);

// 5. garbage input rejected
assert((await post({ address: "not-an-address", message: "hi" })).status === 400, "bad address rejected");
assert((await post({ address: signer.address, message: "" })).status === 400, "empty message rejected");

// 6. ERC-1271 path: the impersonation holder (DevSigner1271 etched by
// anvil:setup) accepts messages signed by anvil dev key 0.
const holder = readFileSync(join(root, ".env.local"), "utf8").match(/^NEXT_PUBLIC_IMPERSONATE=(.+)$/m)?.[1]?.trim();
let holder1271Message: string | null = null;
if (holder) {
  holder1271Message = `route test ${Date.now()}: 1271 dev-shim submission`;
  const devSigner = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const devSig = await devSigner.signMessage({ message: sendoffSignPayload(holder, holder1271Message) });
  res = await post({ address: holder, message: holder1271Message, signature: devSig });
  assert(res.status === 200, `1271 dev-shim signature accepted (got ${res.status})`);
} else {
  console.log("  (skipping 1271 test — NEXT_PUBLIC_IMPERSONATE not set)");
}

// 7. only the signed rows landed in Postgres, with the right shape
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const signedRow = await prisma.sendoffMessage.findFirst({ where: { message } });
assert(signedRow, "signed row stored in postgres");
assert(signedRow!.address === signer.address.toLowerCase(), "signed row has lowercased address");
assert(signedRow!.signature === signature, "signed row keeps the signature");
const unsignedRow = await prisma.sendoffMessage.findFirst({ where: { message: unsignedMessage } });
assert(!unsignedRow, "rejected unsigned submission was not stored");
if (holder1271Message) {
  const row1271 = await prisma.sendoffMessage.findFirst({ where: { message: holder1271Message } });
  assert(row1271, "1271 dev-shim row stored in postgres");
  await prisma.sendoffMessage.deleteMany({ where: { message: holder1271Message } });
}
await prisma.sendoffMessage.deleteMany({ where: { address: signer.address.toLowerCase() } });
await prisma.$disconnect();

console.log("✓ sendoff route: verify + store + reject paths all pass");
