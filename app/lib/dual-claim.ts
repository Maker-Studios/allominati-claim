export type Risk = "low" | "medium" | "high";
export type Screen =
  | "connect"
  | "portfolio"
  | "allocate"
  | "sendoff"
  | "review"
  | "processing"
  | "receipt";

/** Allocation destination for the refund path (projects use their id). */
export const REFUND = "refund";

export interface Project {
  id: string;
  name: string;
  tag: string;
  desc: string;
  raised: number;
  ret: string;
  risk: Risk;
  payout?: string;
  active?: boolean;
}

export interface Nft {
  id: string;
  value: number;
  redeemed?: boolean;
  /** IPFS-gateway artwork URL from token metadata; absent until resolved. */
  image?: string;
}

export interface Draft {
  name: string;
  tag: string;
  desc: string;
  payout: string;
  risk: Risk;
}

/** nft id -> REFUND | project id */
export type Alloc = Record<string, string>;

export const CONFIG = {
  showRiskLevel: false,
  refundEnabled: true,
  requireBurnAck: true,
  requireRiskAck: true,
};

export const EMPTY_DRAFT: Draft = {
  name: "",
  tag: "",
  desc: "",
  payout: "",
  risk: "medium",
};

export function fmt(n: number): string {
  return (Math.round(n * 10000) / 10000).toString();
}

export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function riskColor(r: Risk): string {
  return r === "high" ? "#f0a35e" : r === "medium" ? "#e0c45e" : "#46d6a6";
}

export function riskLabel(r: Risk): string {
  return r.charAt(0).toUpperCase() + r.slice(1) + " risk";
}

export interface ClaimSummary {
  refundNfts: Nft[];
  refundCount: number;
  refundTotal: number;
  investNfts: Nft[];
  investTotal: number;
  assignedCount: number;
  unassignedCount: number;
  gas: number;
}

export function summarizeClaim(nfts: Nft[], alloc: Alloc): ClaimSummary {
  const refundNfts = nfts.filter((n) => alloc[n.id] === REFUND);
  const investNfts = nfts.filter((n) => alloc[n.id] && alloc[n.id] !== REFUND);
  const assignedCount = Object.keys(alloc).length;
  return {
    refundNfts,
    refundCount: refundNfts.length,
    refundTotal: refundNfts.reduce((a, n) => a + n.value, 0),
    investNfts,
    investTotal: investNfts.reduce((a, n) => a + n.value, 0),
    assignedCount,
    unassignedCount: nfts.length - assignedCount,
    gas: assignedCount * 0.0012,
  };
}

/** NFTs committed to a given project, with their total value. */
export function committedTo(nfts: Nft[], alloc: Alloc, projectId: string) {
  const committed = nfts.filter((n) => alloc[n.id] === projectId);
  return { nfts: committed, count: committed.length, total: committed.reduce((a, n) => a + n.value, 0) };
}
