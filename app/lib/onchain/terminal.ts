"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatEther, type AbiEvent, type Address } from "viem";
import { dualClaimAbi, wethAbi } from "./abi";
import { CLAIM_ADDRESS } from "./addresses";

/** One event-log row on the terminal. */
export interface TerminalEvent {
  key: string;
  timestamp: number; // unix seconds
  actor: Address;
  kind: "invest" | "refund" | "extend";
  detail: string; // project name / "wallet"
  amountWei: bigint;
}

export interface ProjectOutflow {
  name: string;
  raisedWei: bigint;
  backers: number; // distinct claimers
}

export interface TerminalData {
  blockNumber: bigint;
  now: number; // latest block timestamp (unix seconds)
  closesAt: number;
  availableWei: bigint; // what claims can pull now: Safe WETH balance ∩ allowance
  allowanceWei: bigint; // WETH allowance the Safe granted the contract
  totalSeededWei: bigint; // outstanding liability
  totalClaimedWei: bigint;
  refundWei: bigint;
  investWei: bigint;
  refundNfts: number;
  investNfts: number;
  seededNfts: number; // tokens ever seeded with a value
  projects: ProjectOutflow[];
  events: TerminalEvent[]; // newest first
}

const EVENT_NAMES = [
  "TokenRedeemed",
  "ProjectFunded",
  "ClaimExecuted",
  "WindowExtended",
  "TokenValueSet",
] as const;

const events = dualClaimAbi.filter(
  (e): e is Extract<(typeof dualClaimAbi)[number], { type: "event" }> =>
    e.type === "event" && (EVENT_NAMES as readonly string[]).includes(e.name),
) as unknown as AbiEvent[];

// Log scans must not span the whole chain (fork nodes forward historical
// ranges to their upstream RPC, which rejects them). Resolution order:
// explicit deploy block from env → the anvil fork boundary → earliest.
let fromBlockCache: bigint | "earliest" | null = null;
async function resolveFromBlock(client: NonNullable<ReturnType<typeof usePublicClient>>) {
  if (fromBlockCache !== null) return fromBlockCache;
  const env = process.env.NEXT_PUBLIC_CLAIM_DEPLOY_BLOCK;
  if (env) {
    fromBlockCache = BigInt(env);
  } else {
    try {
      const meta = (await client.request({
        method: "anvil_metadata" as never,
        params: [] as never,
      })) as { forkedNetwork?: { forkBlockNumber?: number } };
      const forkBlock = meta?.forkedNetwork?.forkBlockNumber;
      fromBlockCache = forkBlock ? BigInt(forkBlock) : "earliest";
    } catch {
      fromBlockCache = "earliest";
    }
  }
  return fromBlockCache;
}

/**
 * Everything the public terminal shows, derived from contract views plus the
 * full event history, re-fetched roughly every block.
 */
export function useTerminal() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["terminal"],
    enabled: Boolean(client && CLAIM_ADDRESS),
    refetchInterval: 12_000,
    queryFn: async (): Promise<TerminalData> => {
      const read = <T,>(functionName: string) =>
        client!.readContract({
          address: CLAIM_ADDRESS,
          abi: dualClaimAbi,
          functionName,
        } as Parameters<NonNullable<typeof client>["readContract"]>[0]) as Promise<T>;

      // resolveFromBlock may cost a slow anvil_metadata round-trip on hosted
      // forks — never let the contract reads queue behind it.
      const [block, availableWei, token, treasury, totalSeededWei, totalClaimedWei, closesAt, projectList, logs] =
        await Promise.all([
          client!.getBlock(),
          read<bigint>("available"),
          read<Address>("token"),
          read<Address>("treasury"),
          read<bigint>("totalSeeded"),
          read<bigint>("totalClaimed"),
          read<bigint>("closesAt"),
          read<{ name: string; raised: bigint }[]>("getProjects"),
          resolveFromBlock(client!).then((fromBlock) =>
            client!.getLogs({ address: CLAIM_ADDRESS, events, fromBlock }),
          ),
        ]);
      // The WETH allowance the Safe granted the contract — the funding cap.
      const allowanceWei = await client!.readContract({
        address: token,
        abi: wethAbi,
        functionName: "allowance",
        args: [treasury, CLAIM_ADDRESS],
      });

      // ---- aggregate the history ----
      let refundWei = 0n;
      let investWei = 0n;
      let refundNfts = 0;
      let investNfts = 0;
      const seeded = new Set<string>();
      const backersByProject = new Map<number, Set<string>>();
      const rows: Omit<TerminalEvent, "timestamp">[] = [];
      const rowBlocks: bigint[] = [];

      const pushRow = (row: Omit<TerminalEvent, "timestamp">, blockNumber: bigint) => {
        rows.push(row);
        rowBlocks.push(blockNumber);
      };

      for (const log of logs) {
        const args = log.args as Record<string, unknown>;
        const key = `${log.blockNumber}-${log.logIndex}`;
        switch (log.eventName) {
          case "TokenValueSet":
            if ((args.value as bigint) > 0n) seeded.add(String(args.tokenId));
            else seeded.delete(String(args.tokenId));
            break;
          case "TokenRedeemed": {
            const value = args.value as bigint;
            if ((args.destination as bigint) === 0n) {
              refundWei += value;
              refundNfts++;
            } else {
              investWei += value;
              investNfts++;
            }
            break;
          }
          case "ProjectFunded": {
            const pid = Number(args.projectId as bigint);
            if (!backersByProject.has(pid)) backersByProject.set(pid, new Set());
            backersByProject.get(pid)!.add((args.claimer as string).toLowerCase());
            pushRow(
              {
                key,
                actor: args.claimer as Address,
                kind: "invest",
                detail: projectList[pid - 1]?.name ?? `project #${pid}`,
                amountWei: args.amount as bigint,
              },
              log.blockNumber,
            );
            break;
          }
          case "ClaimExecuted":
            if ((args.refundTotal as bigint) > 0n) {
              pushRow(
                {
                  key: `${key}-refund`,
                  actor: args.claimer as Address,
                  kind: "refund",
                  detail: "wallet",
                  amountWei: args.refundTotal as bigint,
                },
                log.blockNumber,
              );
            }
            break;
          case "WindowExtended":
            pushRow(
              {
                key,
                actor: CLAIM_ADDRESS,
                kind: "extend",
                detail: `to ${new Date(Number(args.closesAt as bigint) * 1000).toISOString().slice(0, 10)}`,
                amountWei: 0n,
              },
              log.blockNumber,
            );
            break;
        }
      }

      // Timestamps for the latest rows only (one getBlock per unique block).
      const latestIdx = rows.map((_, i) => i).slice(-12);
      const uniqueBlocks = [...new Set(latestIdx.map((i) => rowBlocks[i]))];
      const stamps = new Map(
        await Promise.all(
          uniqueBlocks.map(async (bn) => {
            const b = await client!.getBlock({ blockNumber: bn });
            return [bn, Number(b.timestamp)] as const;
          }),
        ),
      );
      const eventRows: TerminalEvent[] = latestIdx
        .map((i) => ({ ...rows[i], timestamp: stamps.get(rowBlocks[i]) ?? 0 }))
        .reverse();

      return {
        blockNumber: block.number,
        now: Number(block.timestamp),
        closesAt: Number(closesAt),
        availableWei,
        allowanceWei,
        totalSeededWei,
        totalClaimedWei,
        refundWei,
        investWei,
        refundNfts,
        investNfts,
        seededNfts: seeded.size,
        projects: projectList.map((p, i) => ({
          name: p.name,
          raisedWei: p.raised,
          backers: backersByProject.get(i + 1)?.size ?? 0,
        })),
        events: eventRows,
      };
    },
  });
}

export const fmtEth = (wei: bigint) => {
  const n = Number(formatEther(wei));
  return n >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : (Math.round(n * 10000) / 10000).toString();
};
