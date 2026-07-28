"use client";

import { createContext, useContext } from "react";
import { isAddress, type Address } from "viem";
import { IMPERSONATE, IS_LOCAL } from "./addresses";

// Runtime impersonation selection (local fork only). The active account and
// the saved list live in localStorage so they survive reloads; the
// NEXT_PUBLIC_IMPERSONATE env var is only the first-run default.
const ACTIVE_KEY = "allo.impersonate";
const LIST_KEY = "allo.impersonate.list";

export interface Impersonation {
  /** active impersonated account, or null to connect a real wallet */
  account: Address | null;
  /** accounts previously used on this browser */
  saved: Address[];
  /** activate an account (adds it to saved) or null for real-wallet mode */
  select: (account: Address | null) => void;
  /** drop an account from the saved list (deactivates it if active) */
  remove: (account: Address) => void;
}

export const ImpersonationContext = createContext<Impersonation>({
  account: null,
  saved: [],
  select: () => {},
  remove: () => {},
});

export const useImpersonation = () => useContext(ImpersonationContext);

const envDefault: Address | null = IS_LOCAL && isAddress(IMPERSONATE) ? IMPERSONATE : null;

/** Well-known fork accounts that are always offered in the picker. */
export const DEFAULT_ACCOUNTS: Address[] = [
  "0x6Dc43be93a8b5Fd37dC16f24872BaBc6dA5E5e3E",
  "0x285e093e334A4aD3D1f37c5E8F8B5761eD0CF1f7",
  "0xF362a9d7bA3E2ff709F27d78C0545533763D06c1",
];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Pinned = defaults plus the env seed; always present, never removable.
const pinned: Address[] =
  envDefault && !DEFAULT_ACCOUNTS.some((a) => same(a, envDefault))
    ? [envDefault, ...DEFAULT_ACCOUNTS]
    : [...DEFAULT_ACCOUNTS];

export function isPinned(account: Address): boolean {
  return pinned.some((a) => same(a, account));
}

/** SSR-safe initial state — must not touch localStorage (hydration). */
export function defaultImpersonation(): { account: Address | null; saved: Address[] } {
  return { account: envDefault, saved: pinned };
}

/** Browser state: what was last used here, falling back to the env default. */
export function loadImpersonation(): { account: Address | null; saved: Address[] } {
  if (!IS_LOCAL || typeof window === "undefined") return defaultImpersonation();
  // null = never chosen (use env default); "" = explicitly chose real wallet.
  const stored = window.localStorage.getItem(ACTIVE_KEY);
  const account = stored === null ? envDefault : isAddress(stored) ? stored : null;
  let extras: Address[] = [];
  try {
    extras = (JSON.parse(window.localStorage.getItem(LIST_KEY) ?? "[]") as string[]).filter((a) =>
      isAddress(a),
    ) as Address[];
  } catch {
    // corrupt list — start over
  }
  const saved = [...pinned];
  for (const a of [...extras, account]) {
    if (a && !saved.some((s) => same(s, a))) saved.push(a);
  }
  return { account, saved };
}

export function persistImpersonation(account: Address | null, saved: Address[]) {
  window.localStorage.setItem(ACTIVE_KEY, account ?? "");
  // Pinned accounts re-merge on load; only user additions need persisting.
  window.localStorage.setItem(LIST_KEY, JSON.stringify(saved.filter((a) => !isPinned(a))));
}
