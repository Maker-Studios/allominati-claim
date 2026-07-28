"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { createWalletClient, formatEther, http, type Hex } from "viem";
import { dualClaimAbi, nftAbi } from "./abi";
import { CLAIM_ADDRESS, FORK_RPC_URL, NFT_ADDRESS } from "./addresses";
import { activeChain } from "./wagmi";
import { useImpersonation } from "./impersonation";
import type { Nft, Project } from "../dual-claim";

/**
 * All tokenIds the connected wallet owns. The NFT has no enumeration
 * extension, but ids are simply 1..counter() (and soulbound tokens never
 * move), so one counter() read + an ownerOf multicall covers the set.
 */
export function useOwnedTokenIds() {
  const { address } = useAccount();
  const client = usePublicClient();
  return useQuery({
    queryKey: ["ownedTokenIds", address],
    enabled: Boolean(address && client),
    staleTime: 60_000,
    queryFn: async () => {
      const counter = await client!.readContract({
        address: NFT_ADDRESS,
        abi: nftAbi,
        functionName: "counter",
      });
      const ids = Array.from({ length: Number(counter) }, (_, i) => BigInt(i + 1));
      const owners = await client!.multicall({
        contracts: ids.map((id) => ({
          address: NFT_ADDRESS,
          abi: nftAbi,
          functionName: "ownerOf" as const,
          args: [id],
        })),
        allowFailure: false,
      });
      return ids.filter((_, i) => (owners[i] as string).toLowerCase() === address!.toLowerCase());
    },
  });
}

export interface OwnedNfts {
  /** redeemable now: seeded value, not yet redeemed */
  claimable: Nft[];
  /** tokens excluded from claiming (already redeemed or value 0) */
  excludedCount: number;
  isLoading: boolean;
}

/**
 * Resolve token artwork: multicall tokenURI, fetch each distinct metadata
 * variant once (the collection shares a handful), and map ipfs:// to the
 * ipfs.io gateway. Returns tokenId -> image URL; failures just leave tiles
 * on the placeholder art, never block the claim flow.
 */
function useTokenImages(ids: bigint[]) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["tokenImages", ids.map(String).join(",")],
    enabled: Boolean(client) && ids.length > 0,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const uris = await client!.multicall({
        contracts: ids.map((id) => ({
          address: NFT_ADDRESS,
          abi: nftAbi,
          functionName: "tokenURI" as const,
          args: [id],
        })),
        allowFailure: true,
      });
      const toGateway = (u: string) => u.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/");
      const variants = new Map<string, Promise<string | null>>();
      const imageOf = (uri: string) => {
        if (!variants.has(uri)) {
          variants.set(
            uri,
            fetch(toGateway(uri))
              .then((r) => (r.ok ? r.json() : null))
              .then((meta) => (meta?.image ? toGateway(meta.image) : null))
              .catch(() => null),
          );
        }
        return variants.get(uri)!;
      };
      const images: Record<string, string> = {};
      await Promise.all(
        ids.map(async (id, i) => {
          const uri = uris[i];
          if (uri.status !== "success") return;
          const image = await imageOf(uri.result as string);
          if (image) images[id.toString()] = image;
        }),
      );
      return images;
    },
  });
}

export function useOwnedNfts(): OwnedNfts {
  const owned = useOwnedTokenIds();
  const ids = owned.data ?? [];
  const values = useReadContract({
    address: CLAIM_ADDRESS,
    abi: dualClaimAbi,
    functionName: "valuesOf",
    args: [ids],
    query: { enabled: ids.length > 0, staleTime: 30_000 },
  });
  const images = useTokenImages(ids);

  if (!owned.data || (ids.length > 0 && !values.data)) {
    return { claimable: [], excludedCount: 0, isLoading: owned.isLoading || values.isLoading };
  }
  const [vals, redeemedFlags] = values.data ?? [[], []];
  const claimable: Nft[] = [];
  let excludedCount = 0;
  ids.forEach((id, i) => {
    const value = vals[i] ?? 0n;
    if (value > 0n && !redeemedFlags[i]) {
      claimable.push({
        id: id.toString(),
        value: Number(formatEther(value)),
        image: images.data?.[id.toString()],
      });
    } else {
      excludedCount++;
    }
  });
  return { claimable, excludedCount, isLoading: false };
}

export function useProjects() {
  const result = useReadContract({
    address: CLAIM_ADDRESS,
    abi: dualClaimAbi,
    functionName: "getProjects",
    query: { staleTime: 30_000 },
  });
  const projects: Project[] = (result.data ?? []).map((p, i) => ({
    id: String(i + 1),
    name: p.name,
    tag: p.tag,
    desc: p.description,
    raised: Number(formatEther(p.raised)),
    ret: "",
    risk: "medium",
    payout: p.payout,
    active: p.active,
  }));
  return { projects, isLoading: result.isLoading };
}

/** Claim-window deadline; claims revert on-chain once it passes. */
export function useClosesAt(): Date | null {
  const { data } = useReadContract({
    address: CLAIM_ADDRESS,
    abi: dualClaimAbi,
    functionName: "closesAt",
    query: { staleTime: 300_000 },
  });
  return data ? new Date(Number(data) * 1000) : null;
}

export function useIsAdmin() {
  const { address } = useAccount();
  const { data: owner } = useReadContract({
    address: CLAIM_ADDRESS,
    abi: dualClaimAbi,
    functionName: "owner",
    query: { staleTime: 300_000 },
  });
  return Boolean(address && owner && address.toLowerCase() === owner.toLowerCase());
}

/** Admin writes (registerProject / setProjectActive), impersonation-aware. */
export function useAdminActions() {
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const { account: impersonated } = useImpersonation();
  const { data: owner } = useReadContract({
    address: CLAIM_ADDRESS,
    abi: dualClaimAbi,
    functionName: "owner",
    query: { staleTime: 300_000 },
  });
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (functionName: "registerProject" | "setProjectActive", args: readonly unknown[]) => {
      setPending(true);
      try {
        let hash: Hex;
        if (impersonated) {
          // Impersonate the contract owner on anvil so the admin console
          // is drivable in dev mode regardless of the connected account.
          const wallet = createWalletClient({
            account: owner!,
            chain: activeChain,
            transport: http(FORK_RPC_URL),
          });
          hash = await wallet.writeContract({
            address: CLAIM_ADDRESS,
            abi: dualClaimAbi,
            functionName,
            args,
          } as Parameters<typeof wallet.writeContract>[0]);
        } else {
          hash = await writeContractAsync({
            address: CLAIM_ADDRESS,
            abi: dualClaimAbi,
            functionName,
            args,
          } as Parameters<typeof writeContractAsync>[0]);
        }
        await client!.waitForTransactionReceipt({ hash });
        await queryClient.invalidateQueries();
      } finally {
        setPending(false);
      }
    },
    [client, impersonated, owner, queryClient, writeContractAsync],
  );

  return {
    pending,
    registerProject: (name: string, tag: string, description: string, payout: string) =>
      run("registerProject", [name, tag, description, payout]),
    setProjectActive: (projectId: bigint, active: boolean) => run("setProjectActive", [projectId, active]),
  };
}

export type ClaimStatus = "idle" | "wallet" | "pending" | "success" | "error";

export function useClaim() {
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const { account: impersonated } = useImpersonation();
  const [status, setStatus] = useState<ClaimStatus>("idle");
  const [hash, setHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (tokenIds: bigint[], dests: bigint[]) => {
      setStatus("wallet");
      setError(null);
      setHash(null);
      try {
        let txHash: Hex;
        if (impersonated) {
          // Send the tx unsigned as the impersonated holder;
          // anvil --auto-impersonate executes it.
          const wallet = createWalletClient({
            account: impersonated,
            chain: activeChain,
            transport: http(FORK_RPC_URL),
          });
          txHash = await wallet.writeContract({
            address: CLAIM_ADDRESS,
            abi: dualClaimAbi,
            functionName: "claim",
            args: [tokenIds, dests],
          });
        } else {
          txHash = await writeContractAsync({
            address: CLAIM_ADDRESS,
            abi: dualClaimAbi,
            functionName: "claim",
            args: [tokenIds, dests],
          });
        }
        setHash(txHash);
        setStatus("pending");
        const receipt = await client!.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status === "success") {
          setStatus("success");
        } else {
          setStatus("error");
          setError("Transaction reverted on-chain.");
        }
      } catch (e) {
        setStatus("error");
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.split("\n")[0].slice(0, 200));
      }
    },
    [client, impersonated, writeContractAsync],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setHash(null);
    setError(null);
    // Redeemed flags, raised totals, and ownership views all changed.
    queryClient.invalidateQueries();
  }, [queryClient]);

  return { status, hash, error, submit, reset };
}
