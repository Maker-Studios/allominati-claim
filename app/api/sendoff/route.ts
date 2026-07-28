import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { createPublicClient, http, isAddress, type Address, type Hex } from "viem";
import { SENDOFF_MAX_LENGTH, sendoffSignPayload } from "../../lib/sendoff";
import { db } from "../../lib/db";

const IS_MAINNET = process.env.NEXT_PUBLIC_CHAIN === "mainnet";

// Verification needs an RPC (ERC-1271/6492 smart wallets verify via
// eth_call). Local-mode signatures come from wallets on the fork.
const RPC_URL = IS_MAINNET
  ? (process.env.ETH_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-rpc.publicnode.com")
  : (process.env.NEXT_PUBLIC_FORK_RPC_URL ?? "http://127.0.0.1:8545");

/**
 * Signed send-off messages. The holder signs the canonical payload with
 * their wallet; we verify it here (EOA or ERC-1271 — impersonated dev
 * accounts verify through the DevSigner1271 shim etched on the fork) and
 * store the row in Postgres (DATABASE_URL). No signature, no row.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const { address, message, signature } = (body ?? {}) as {
    address?: unknown;
    message?: unknown;
    signature?: unknown;
  };
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }
  if (text.length > SENDOFF_MAX_LENGTH) {
    return Response.json({ error: "message too long" }, { status: 400 });
  }
  if (typeof address !== "string" || !isAddress(address)) {
    return Response.json({ error: "a valid address is required" }, { status: 400 });
  }

  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return Response.json({ error: "signature is required" }, { status: 401 });
  }
  const client = createPublicClient({ transport: http(RPC_URL) });
  let valid = false;
  try {
    valid = await client.verifyMessage({
      address: address as Address,
      message: sendoffSignPayload(address, text),
      signature: signature as Hex,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    return Response.json({ error: "signature verification failed" }, { status: 401 });
  }

  if (process.env.DATABASE_URL) {
    await db().sendoffMessage.create({
      data: {
        address: address.toLowerCase(),
        message: text,
        signature,
      },
    });
  } else if (IS_MAINNET) {
    console.error("sendoff: DATABASE_URL is not configured");
    return Response.json({ error: "storage unavailable" }, { status: 500 });
  } else {
    // DB-less local dev: keep the old jsonl drop so the flow stays usable.
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    await appendFile(
      path.join(dir, "sendoff-messages.jsonl"),
      JSON.stringify({
        address: address.toLowerCase(),
        message: text,
        signature,
        at: new Date().toISOString(),
      }) + "\n",
    );
  }

  return Response.json({ ok: true });
}
