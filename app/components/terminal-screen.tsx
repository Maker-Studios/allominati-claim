"use client";

import Link from "next/link";
import { CLAIM_ADDRESS } from "../lib/onchain/addresses";
import { useTerminal, fmtEth, type TerminalEvent } from "../lib/onchain/terminal";
import { shortAddress } from "../lib/dual-claim";

const MINT = "#46d6a6";
const BLUE = "#5b9dff";
const ORANGE = "#f0a35e";

/** label ···· value, the terminal's basic row */
function Row({
  label,
  value,
  valueColor,
  big,
  indent,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  valueColor?: string;
  big?: boolean;
  indent?: boolean;
}) {
  return (
    <div className={`flex items-baseline gap-2.5 ${big ? "py-1" : ""} ${indent ? "pl-5" : ""}`}>
      <span
        className={`whitespace-nowrap font-mono ${big ? "text-[13px] font-semibold text-fg" : "text-xs text-muted"}`}
      >
        {label}
      </span>
      <span className="mb-[3px] flex-1 border-b border-dotted border-[#242a34]" />
      <span
        className={`whitespace-nowrap font-mono ${big ? "text-[17px] font-semibold" : "text-[13px]"}`}
        style={{ color: valueColor ?? "#eef1f5" }}
      >
        {value}
      </span>
    </div>
  );
}

/** Block-segment bar; each segment gets its own color (or the empty color). */
function SegmentBar({ segments, colors }: { segments: number; colors: string[] }) {
  return (
    <span className="inline-flex gap-[2px]">
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="h-[11px] w-[7px] rounded-[1px]"
          style={{ background: colors[i] ?? "#1e232b" }}
        />
      ))}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 font-mono text-[10.5px] tracking-[2px] text-dim">{children}</div>
  );
}

const HR = () => <div className="my-5 border-t border-line" />;

function countdown(now: number, closesAt: number): string {
  const diff = closesAt - now;
  if (diff <= 0) return "CLOSED";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  return `T–${d}d ${h}h`;
}

function eventStyle(kind: TerminalEvent["kind"]): { label: string; color: string } {
  switch (kind) {
    case "invest":
      return { label: "INVEST", color: MINT };
    case "refund":
      return { label: "REFUND", color: BLUE };
    case "extend":
      return { label: "EXTEND", color: ORANGE };
  }
}

export default function TerminalScreen() {
  const { data, error, refetch } = useTerminal();

  if (!data) {
    return (
      <div className="mx-auto max-w-[760px] px-6 pt-24 text-center font-mono text-xs tracking-[2px] text-muted">
        {error ? (
          <>
            <div className="text-[#e6b0b0]">COULDN&apos;T REACH THE VAULT RPC</div>
            <div className="mt-3 normal-case tracking-normal text-dim">
              {(error as Error).message?.split("\n")[0].slice(0, 120)}
            </div>
            <button
              onClick={() => void refetch()}
              className="mt-5 cursor-pointer rounded-lg border border-line bg-panel px-4 py-2 font-mono text-xs tracking-[2px] text-mint"
            >
              RETRY
            </button>
          </>
        ) : (
          "READING THE VAULT ON-CHAIN…"
        )}
      </div>
    );
  }

  const open = data.now < data.closesAt;
  const totalPool = data.totalClaimedWei + data.totalSeededWei;
  const claimedPct = totalPool > 0n ? Number((data.totalClaimedWei * 1000n) / totalPool) / 10 : 0;
  const outstandingNfts = data.seededNfts - data.refundNfts - data.investNfts;
  const coverage =
    data.totalSeededWei > 0n
      ? Number((data.availableWei * 1000n) / data.totalSeededWei) / 10
      : 100;

  // Main progress bar: filled share split blue (refunds) / mint (invested).
  const SEGS = 24;
  const filled = Math.round((claimedPct / 100) * SEGS);
  const blueSegs =
    data.totalClaimedWei > 0n
      ? Math.round(Number((data.refundWei * BigInt(filled)) / data.totalClaimedWei))
      : 0;
  const mainBar = Array.from({ length: SEGS }, (_, i) =>
    i < blueSegs ? BLUE : i < filled ? MINT : "#1e232b",
  );

  const maxRaised = data.projects.reduce((m, p) => (p.raisedWei > m ? p.raisedWei : m), 1n);
  const closesDate = new Date(data.closesAt * 1000);
  const closesIso = `${closesDate.toISOString().slice(0, 10)} ${closesDate
    .toISOString()
    .slice(11, 16)}Z`;

  return (
    <div className="mx-auto max-w-[760px] px-6 pt-9 pb-16">
      {/* header */}
      <Link
        href="/"
        className="mb-5 inline-block font-mono text-[11px] tracking-[1.5px] text-dim no-underline hover:text-soft"
      >
        ← BACK TO APP
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <span className="h-[15px] w-[15px] rotate-45 rounded-[3px] bg-mint" />
            <span className="font-mono text-[15px] font-semibold tracking-[3px] text-fg">
              ALLOMINATI VAULT
            </span>
          </Link>
          <div className="mt-2 font-mono text-[11px] text-dim">
            {CLAIM_ADDRESS} <span className="text-mint">✓ verified</span>
          </div>
        </div>
        <div className="text-right font-mono text-[11px] leading-[1.9]">
          <div className="text-dim">BLOCK {data.blockNumber.toLocaleString("en-US")}</div>
          <div style={{ color: open ? MINT : ORANGE }}>
            ● WINDOW {open ? "OPEN" : "CLOSED"}
          </div>
          <div className="text-mint">
            {countdown(data.now, data.closesAt)} · CLOSES{" "}
            {closesDate
              .toLocaleDateString("en-US", { month: "short", day: "numeric" })
              .toUpperCase()}
          </div>
        </div>
      </div>

      <HR />

      {/* vault */}
      <div className="flex flex-col gap-2">
        <Row label="SAFE ALLOWANCE" value={`${fmtEth(data.allowanceWei)} WETH`} />
        <Row label="WITHDRAWN" value={`${fmtEth(data.totalClaimedWei)} WETH`} />
        <Row
          indent
          label={`├ refunds · ${data.refundNfts} nfts`}
          value={`${fmtEth(data.refundWei)} WETH`}
          valueColor={BLUE}
        />
        <Row
          indent
          label={`└ projects · ${data.investNfts} nfts`}
          value={`${fmtEth(data.investWei)} WETH`}
          valueColor={MINT}
        />
        <Row
          big
          label="AVAILABLE TO CLAIM"
          value={`${fmtEth(data.availableWei)} WETH`}
          valueColor={MINT}
        />
        <Row label="WINDOW CLOSES" value={`${closesIso} · ${countdown(data.now, data.closesAt)}`} valueColor={MINT} />
        <div className="mt-2 flex items-center gap-3">
          <SegmentBar segments={24} colors={mainBar} />
          <span className="font-mono text-[10.5px] tracking-[1px] text-dim">
            {claimedPct.toFixed(0)}% WITHDRAWN · {outstandingNfts} / {data.seededNfts} NFTS
            OUTSTANDING
          </span>
        </div>
      </div>

      <HR />

      {/* projects */}
      <SectionTitle>OUTFLOW BY PROJECT</SectionTitle>
      <div className="flex flex-col gap-2.5">
        {data.projects.map((p) => {
          const segs = 18;
          const share = Number((p.raisedWei * BigInt(segs)) / maxRaised);
          return (
            <div key={p.name} className="flex items-center gap-3">
              <span className="w-[172px] truncate font-mono text-xs text-soft uppercase">
                {p.name}
              </span>
              <SegmentBar
                segments={segs}
                colors={Array.from({ length: segs }, (_, i) => (i < share ? MINT : "#1e232b"))}
              />
              <span className="ml-auto font-mono text-[13px] text-fg">
                {fmtEth(p.raisedWei)} WETH
              </span>
              <span className="w-[64px] text-right font-mono text-[11px] text-dim">
                {p.backers} addr
              </span>
            </div>
          );
        })}
        {data.projects.length === 0 && (
          <div className="font-mono text-xs text-dim">no projects registered</div>
        )}
      </div>

      <HR />

      {/* treasury / admin */}
      <SectionTitle>TREASURY / ADMIN</SectionTitle>
      <div className="flex flex-col gap-2">
        <Row label="OUTSTANDING LIABILITY" value={`${fmtEth(data.totalSeededWei)} WETH`} />
        <Row
          label="POOL COVERAGE"
          value={`${coverage.toFixed(1)}%`}
          valueColor={coverage >= 100 ? MINT : ORANGE}
        />
        <div className="mt-2 flex items-center gap-3">
          <SegmentBar
            segments={16}
            colors={Array.from({ length: 16 }, (_, i) =>
              i < Math.round((Math.min(coverage, 100) / 100) * 16) ? ORANGE : "#1e232b",
            )}
          />
          <span className="font-mono text-[10.5px] tracking-[1px] text-dim">
            CLAIMS PULL WETH FROM THE SAFE · ALLOWANCE REVOKED AT CLOSE
          </span>
        </div>
      </div>

      <HR />

      {/* event log */}
      <SectionTitle>EVENT LOG · LATEST ACTIVITY</SectionTitle>
      <div className="flex flex-col gap-[7px]">
        {data.events.map((e) => {
          const s = eventStyle(e.kind);
          return (
            <div key={e.key} className="flex items-baseline gap-2 font-mono text-xs">
              <span className="text-dim">
                {new Date(e.timestamp * 1000).toISOString().slice(11, 19)}
              </span>
              <span className="text-soft" title={e.actor}>
                {shortAddress(e.actor)}
              </span>
              <span className="text-dim">→</span>
              <span style={{ color: s.color }}>
                {s.label} · {e.detail}
              </span>
              <span className="ml-auto text-[13px] text-fg">
                {e.amountWei > 0n ? `${fmtEth(e.amountWei)} WETH` : "—"}
              </span>
            </div>
          );
        })}
        {data.events.length === 0 && (
          <div className="font-mono text-xs text-dim">no activity yet</div>
        )}
      </div>

      <div className="mt-9 font-mono text-[10.5px] text-dim">
        read-only · refreshed every block · nothing here requires a signature
      </div>
    </div>
  );
}
