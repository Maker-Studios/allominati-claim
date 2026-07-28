"use client";

import { useState } from "react";
import { encodeFunctionData, formatEther, isAddress, type Address } from "viem";
import { wethAbi } from "../lib/onchain/abi";
import { CLAIM_ADDRESS } from "../lib/onchain/addresses";
import {
  useAdminActions,
  useTreasuryActions,
  useTreasuryPreview,
  useTreasuryStatus,
} from "../lib/onchain/hooks";
import { fmtEth } from "../lib/onchain/terminal";
import { shortAddress } from "../lib/dual-claim";

const MINT = "#46d6a6";
const AMBER = "#f0a35e";

const panelCls = "rounded-[14px] border border-line bg-panel px-5 py-[18px]";
const btnCls =
  "cursor-pointer rounded-lg px-[15px] py-[9px] font-mono text-[11.5px] tracking-[1.5px] disabled:cursor-not-allowed disabled:opacity-50";

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="font-mono text-[10.5px] tracking-[1px] whitespace-nowrap text-dim">
        {label}
      </span>
      <span className="min-w-0 flex-1 translate-y-[-3px] border-b border-dashed border-line" />
      <span className="font-mono text-[12.5px]" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}

/** One raw transaction for the Safe to run, with the fields it asks for. */
function TxPayload({
  step,
  title,
  to,
  value,
  data,
}: {
  step: string;
  title: string;
  to: Address;
  value: bigint;
  data: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      .writeText(`to: ${to}\nvalue: ${value.toString()}\ndata: ${data}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
  };
  return (
    <div className="rounded-[10px] border border-line-2 bg-ink p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] tracking-[1px] text-muted">
          {step} · {title}
        </span>
        <button
          onClick={copy}
          className={`${btnCls} flex-none border border-line-2 bg-transparent py-1.5 text-[10px] text-dim`}
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <div className="flex flex-col gap-1 font-mono text-[11px] break-all text-soft">
        <div>
          <span className="text-dim">to </span>
          {to}
        </div>
        <div>
          <span className="text-dim">value </span>
          {value.toString()} wei{value > 0n && ` (${formatEther(value)} ETH)`}
        </div>
        <div>
          <span className="text-dim">data </span>
          {data}
        </div>
      </div>
    </div>
  );
}

/**
 * Go-live panel: the Safe wraps ETH into WETH and approves the claim contract
 * for the outstanding liability. The approval is the switch — claims revert
 * without it, and revoking it shuts them down.
 */
export default function TreasuryPanel() {
  const { data: status, isLoading } = useTreasuryStatus();
  const tx = useTreasuryActions(status?.treasury, status?.token);
  const admin = useAdminActions();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [editingTreasury, setEditingTreasury] = useState(false);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);
  const preview = useTreasuryPreview(candidate, status?.token);

  if (isLoading || !status) {
    return (
      <div className={`${panelCls} mb-[26px]`}>
        <span className="font-mono text-[11px] tracking-[1px] text-dim">
          READING TREASURY…
        </span>
      </div>
    );
  }

  const { outstandingWei, allowanceWei, wethWei, ethWei, availableWei, wrapWei, needsApproval, funded } = status;
  const settled = outstandingWei === 0n;
  const chip = settled
    ? { color: "#5f6878", label: "NOTHING OUTSTANDING" }
    : funded
      ? { color: MINT, label: "POOL FUNDED" }
      : allowanceWei === 0n
        ? { color: AMBER, label: "NOT APPROVED" }
        : { color: AMBER, label: "UNDERFUNDED" };

  // deposit() adds to the balance, so the wrap is a delta; approve() overwrites
  // the allowance, so it always targets the full outstanding liability.
  const wrapData = encodeFunctionData({ abi: wethAbi, functionName: "deposit" });
  const approveData = encodeFunctionData({
    abi: wethAbi,
    functionName: "approve",
    args: [CLAIM_ADDRESS, outstandingWei],
  });
  const shortOnEth = wrapWei > ethWei;
  const coverage = outstandingWei > 0n ? Number((availableWei * 1000n) / outstandingWei) / 10 : 100;

  const sameAsCurrent = candidate.toLowerCase() === status.treasury.toLowerCase();
  const candidateOk = isAddress(candidate) && !sameAsCurrent;
  const submitTreasury = async () => {
    setTreasuryError(null);
    try {
      await admin.setTreasury(candidate as Address);
      setEditingTreasury(false);
      setCandidate("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTreasuryError(msg.split("\n")[0].slice(0, 200));
    }
  };

  return (
    <div className={`${panelCls} mb-[26px]`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-xs tracking-[2px] text-muted">
          POOL FUNDING · WETH APPROVAL
        </span>
        <span className="font-mono text-[10.5px] tracking-[1px]" style={{ color: chip.color }}>
          ● {chip.label}
        </span>
      </div>
      <p className="mb-[18px] max-w-[70ch] text-[13.5px] leading-[1.5] text-muted">
        The contract holds no funds — every claim pulls WETH straight from the
        treasury Safe {shortAddress(status.treasury)}. The allowance is the
        go-live switch: claims revert without it, and revoking it stops them.
      </p>

      <div className="grid grid-cols-2 gap-x-[26px] gap-y-2.5 max-md:grid-cols-1">
        <Row label="OUTSTANDING LIABILITY" value={`${fmtEth(outstandingWei)} WETH`} />
        <Row label="SAFE WETH BALANCE" value={`${fmtEth(wethWei)} WETH`} />
        <Row
          label="ALLOWANCE"
          value={`${fmtEth(allowanceWei)} WETH`}
          accent={needsApproval ? AMBER : MINT}
        />
        <Row label="SAFE ETH (WRAPPABLE)" value={`${fmtEth(ethWei)} ETH`} />
      </div>

      <div className="mt-[18px] mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[10.5px] tracking-[1px] text-dim">
          AVAILABLE TO CLAIMS
        </span>
        <span className="font-mono text-[12.5px]" style={{ color: funded ? MINT : AMBER }}>
          {fmtEth(availableWei)} / {fmtEth(outstandingWei)} WETH
        </span>
      </div>
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-raise">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.min(100, Math.max(0, coverage))}%`,
            background: funded ? MINT : AMBER,
          }}
        />
      </div>

      {tx.error && (
        <div className="mt-3.5 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2.5">
          <span className="font-mono text-[11px] break-all text-amber">{tx.error}</span>
        </div>
      )}

      {!settled && (funded ? (
        <div className="mt-[18px] flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted">
            Every unredeemed token is payable. Re-approve after seeding new
            values, and revoke once the window closes.
          </span>
          {tx.canSend && allowanceWei > 0n && (
            <button
              onClick={() => {
                if (!confirmRevoke) return setConfirmRevoke(true);
                setConfirmRevoke(false);
                void tx.revoke();
              }}
              onBlur={() => setConfirmRevoke(false)}
              disabled={tx.pending !== null}
              className={`${btnCls} flex-none border bg-transparent`}
              style={{ borderColor: confirmRevoke ? AMBER : "#313846", color: confirmRevoke ? AMBER : "#5f6878" }}
            >
              {tx.pending === "revoke"
                ? "REVOKING…"
                : confirmRevoke
                  ? "CONFIRM REVOKE"
                  : "REVOKE"}
            </button>
          )}
        </div>
      ) : tx.canSend ? (
        // The Safe is drivable from here — walk the steps as buttons.
        <div className="mt-[18px] flex flex-col gap-2.5">
          {wrapWei > 0n && (
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line-2 bg-ink px-3.5 py-3">
              <span className="text-[13.5px] text-soft">
                <span className="font-mono text-[10.5px] tracking-[1px] text-dim">STEP 1 </span>
                Wrap {fmtEth(wrapWei)} ETH into WETH
                {shortOnEth && (
                  <span className="text-amber"> — Safe only holds {fmtEth(ethWei)} ETH</span>
                )}
              </span>
              <button
                onClick={() => void tx.wrap(wrapWei)}
                disabled={tx.pending !== null || shortOnEth}
                className={`${btnCls} flex-none bg-blue text-blue-ink`}
              >
                {tx.pending === "wrap" ? "WRAPPING…" : "WRAP"}
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line-2 bg-ink px-3.5 py-3">
            <span className="text-[13.5px] text-soft">
              <span className="font-mono text-[10.5px] tracking-[1px] text-dim">
                STEP {wrapWei > 0n ? 2 : 1}{" "}
              </span>
              Approve {fmtEth(outstandingWei)} WETH for {shortAddress(CLAIM_ADDRESS)}
            </span>
            <button
              onClick={() => void tx.approve(outstandingWei)}
              disabled={tx.pending !== null}
              className={`${btnCls} flex-none bg-blue text-blue-ink`}
            >
              {tx.pending === "approve" ? "APPROVING…" : "APPROVE"}
            </button>
          </div>
        </div>
      ) : null)}

      {!settled && !funded && !tx.canSend && (
        <div className="mt-3.5 flex flex-col gap-2.5">
          <p className="text-[13px] leading-[1.5] text-dim">
            Only the Safe can wrap and approve — connect{" "}
            {shortAddress(status.treasury)} itself, or run these transactions
            from the Safe UI:
          </p>
          {wrapWei > 0n && (
            <TxPayload
              step="STEP 1"
              title={`wrap ${fmtEth(wrapWei)} ETH`}
              to={status.token}
              value={wrapWei}
              data={wrapData}
            />
          )}
          <TxPayload
            step={`STEP ${wrapWei > 0n ? 2 : 1}`}
            title={`approve ${fmtEth(outstandingWei)} WETH`}
            to={status.token}
            value={0n}
            data={approveData}
          />
        </div>
      )}

      <div className="mt-[18px] border-t border-line-3 pt-[15px]">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] tracking-[1px] text-dim">
            CLAIMS DRAW FROM <span className="text-soft">{status.treasury}</span>
          </span>
          <button
            onClick={() => {
              setEditingTreasury((v) => !v);
              setCandidate("");
              setTreasuryError(null);
            }}
            className={`${btnCls} flex-none border border-line-2 bg-transparent text-[10px] text-dim`}
          >
            {editingTreasury ? "CANCEL" : "CHANGE"}
          </button>
        </div>

        {editingTreasury && (
          <div className="mt-3">
            <div className="flex gap-2.5">
              <input
                value={candidate}
                onChange={(e) => setCandidate(e.target.value.trim())}
                placeholder="0x… new funding Safe"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-[9px] border border-line-2 bg-ink px-[13px] py-[11px] font-mono text-[13px] text-fg outline-none focus:border-line-4"
              />
              <button
                onClick={() => void submitTreasury()}
                disabled={!candidateOk || admin.pending}
                className={`${btnCls} flex-none bg-blue text-blue-ink`}
              >
                {admin.pending ? "UPDATING…" : "UPDATE"}
              </button>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-[1.5] text-muted">
              Claims will pull WETH from this address instead. It has to hold
              the {fmtEth(outstandingWei)} WETH and approve{" "}
              {shortAddress(CLAIM_ADDRESS)}{" "}
              itself — the current Safe&apos;s allowance does not carry over,
              and unclaimed value stays where it is.
            </p>
            {candidate.length > 0 && !isAddress(candidate) && (
              <p className="mt-1.5 font-mono text-[11px] text-amber">
                Not a valid address.
              </p>
            )}
            {sameAsCurrent && isAddress(candidate) && (
              <p className="mt-1.5 font-mono text-[11px] text-dim">
                Already the treasury.
              </p>
            )}
            {candidateOk && preview.data && (
              <p className="mt-1.5 font-mono text-[11px] text-dim">
                HOLDS {fmtEth(preview.data.wethWei)} WETH · ALLOWANCE{" "}
                <span
                  style={{
                    color: preview.data.allowanceWei >= outstandingWei ? MINT : AMBER,
                  }}
                >
                  {fmtEth(preview.data.allowanceWei)} WETH
                </span>
              </p>
            )}
            {treasuryError && (
              <p className="mt-2 font-mono text-[11px] break-all text-amber">{treasuryError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
