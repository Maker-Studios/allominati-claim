"use client";

import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useConnect, useEnsName, useReadContract } from "wagmi";
import { isAddress, type Address } from "viem";
import { CLAIM_ADDRESS, IS_LOCAL } from "../lib/onchain/addresses";
import { dualClaimAbi } from "../lib/onchain/abi";
import { isPinned, useImpersonation } from "../lib/onchain/impersonation";
import { shortAddress } from "../lib/dual-claim";

/** ENS name when the fork can reverse-resolve one, else the short address. */
function AddressLabel({ address }: { address: Address }) {
  const { data: ens } = useEnsName({ address, query: { staleTime: 3_600_000 } });
  return <span title={address}>{ens ?? shortAddress(address)}</span>;
}

function ConnectWalletButton() {
  const { connect, connectors } = useConnect();
  const { account } = useImpersonation();

  const cls =
    "inline-flex cursor-pointer items-center gap-3 rounded-xl bg-mint px-[30px] py-[17px] text-base font-semibold text-mint-ink";
  const dot = <span className="h-[9px] w-[9px] rounded-full bg-mint-ink" />;

  if (account) {
    return (
      <button onClick={() => connect({ connector: connectors[0] })} className={cls}>
        {dot}
        Connect wallet
      </button>
    );
  }
  return (
    <ConnectKitButton.Custom>
      {({ show }) => (
        <button onClick={show} className={cls}>
          {dot}
          Connect wallet
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}

function Chip({
  active,
  onClick,
  onRemove,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  return (
    <span
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors"
      style={{
        borderColor: active ? "#46d6a6" : "#262c36",
        color: active ? "#46d6a6" : "#9aa3b2",
        background: active ? "rgba(70,214,166,0.08)" : "transparent",
      }}
    >
      {children}
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 cursor-pointer text-dim hover:text-soft"
          title="Remove"
        >
          ×
        </span>
      )}
    </span>
  );
}

/** Dev-only (local fork): pick or add the account the app impersonates. */
function ImpersonationPicker() {
  const { account, saved, select, remove } = useImpersonation();
  // The contract owner, offered as "Admin Account" — always tracks whoever
  // owns the current deployment.
  const { data: adminAccount } = useReadContract({
    address: CLAIM_ADDRESS,
    abi: dualClaimAbi,
    functionName: "owner",
    query: { staleTime: 300_000, enabled: IS_LOCAL },
  });
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [showForm, setShowForm] = useState(false);

  if (!IS_LOCAL) return null;

  const isAdmin = (a: Address) => Boolean(adminAccount && a.toLowerCase() === adminAccount.toLowerCase());

  const add = () => {
    const candidate = draft.trim();
    if (!isAddress(candidate)) {
      setInvalid(true);
      return;
    }
    select(candidate as Address);
    setDraft("");
    setInvalid(false);
    setShowForm(false);
  };

  return (
    <div className="mt-10 w-full max-w-[560px] rounded-2xl border border-line bg-[rgba(16,19,24,0.55)] p-5 text-left backdrop-blur-[6px]">
      <div className="mb-3 font-mono text-[10.5px] tracking-[2px] text-dim">
        DEV · IMPERSONATE AN ACCOUNT
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip active={account === null} onClick={() => select(null)}>
          Real wallet
        </Chip>
        {adminAccount && (
          <Chip
            active={Boolean(account && isAdmin(account))}
            onClick={() => select(adminAccount)}
          >
            <span title={adminAccount}>Admin Account</span>
          </Chip>
        )}
        {saved
          .filter((a) => !isAdmin(a))
          .map((a) => (
            <Chip
              key={a}
              active={account === a}
              onClick={() => select(a)}
              onRemove={isPinned(a) ? undefined : () => remove(a)}
            >
              <AddressLabel address={a} />
            </Chip>
          ))}
      </div>
      {showForm ? (
        <>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setInvalid(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="0x… holder or owner address"
              spellCheck={false}
              autoFocus
              className="w-full rounded-[9px] border border-line-2 bg-ink px-3 py-2 font-mono text-xs text-fg outline-none focus:border-line-4"
            />
            <button
              onClick={add}
              className="cursor-pointer rounded-[9px] border border-line bg-chip px-3.5 py-2 font-mono text-[11px] tracking-[1px] text-soft"
            >
              ADD
            </button>
          </div>
          {invalid && (
            <div className="mt-2 font-mono text-[10.5px] text-[#f0a35e]">Not a valid address</div>
          )}
        </>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="cursor-pointer border-none bg-transparent p-0 font-mono text-[10.5px] tracking-[1px] text-dim hover:text-soft"
        >
          + ADD ADDRESS
        </button>
      )}
    </div>
  );
}

export default function ConnectScreen() {
  const { account } = useImpersonation();
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 animate-glow bg-[radial-gradient(60%_50%_at_50%_38%,rgba(70,214,166,0.14),transparent_70%),radial-gradient(50%_40%_at_78%_80%,rgba(91,157,255,0.10),transparent_70%)]" />
      <header className="relative flex items-center justify-between px-[34px] py-[26px]">
        <div className="flex items-center gap-[11px]">
          <div className="h-[22px] w-[22px] rotate-45 rounded-[4px] bg-mint" />
          <span className="font-mono text-[13px] tracking-[3px] text-soft">
            ALLOMINATI
          </span>
        </div>
        <a
          href="/terminal"
          className="font-mono text-[11px] tracking-[1.5px] text-dim no-underline hover:text-soft"
        >
          VAULT TERMINAL →
        </a>
      </header>
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 pt-10 pb-[120px] text-center">
        <div className="mb-[22px] font-mono text-xs tracking-[3px] whitespace-nowrap text-mint">
          REDEMPTION WINDOW · OPEN
        </div>
        <h1 className="mb-[22px] max-w-[14ch] text-[clamp(40px,6vw,76px)] leading-[1.02] font-semibold tracking-[-2px]">
          Take your money back, or move it forward.
        </h1>
        <p className="mb-10 max-w-[52ch] text-lg leading-[1.55] text-muted">
          Every Allominati NFT is backed by its original mint value, paid out in WETH.
          Redeem for a full refund, or route that value into a vetted project —
          split it however you like.
        </p>
        <ConnectWalletButton />
        <div className="mt-[18px] font-mono text-xs text-dim">
          {account ? (
            <>
              Dev impersonation · <AddressLabel address={account} />
            </>
          ) : (
            "Non-custodial · You sign every transaction"
          )}
        </div>
        <ImpersonationPicker />
      </main>
    </div>
  );
}
