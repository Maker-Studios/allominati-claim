"use client";

import { useEffect, useState } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import {
  type Alloc,
  type Draft,
  type Screen,
  CONFIG,
  EMPTY_DRAFT,
  REFUND,
  shortAddress,
} from "../lib/dual-claim";
import {
  useAdminActions,
  useClaim,
  useClosesAt,
  useIsAdmin,
  useOwnedNfts,
  useProjects,
} from "../lib/onchain/hooks";
import AdminConsole from "./admin-console";
import AllocateScreen from "./allocate-screen";
import ConnectScreen from "./connect-screen";
import PortfolioScreen from "./portfolio-screen";
import ProcessingScreen from "./processing-screen";
import ReceiptScreen from "./receipt-screen";
import ReviewScreen from "./review-screen";
import SendoffScreen from "./sendoff-screen";

const STEP_ORDER: Partial<Record<Screen, number>> = {
  portfolio: 1,
  allocate: 2,
  sendoff: 3,
  review: 4,
  processing: 4,
  receipt: 4,
};

function TopBar({
  address,
  isAdmin,
  onToggleAdmin,
}: {
  address: string;
  isAdmin: boolean;
  onToggleAdmin: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line-3 bg-[rgba(12,14,18,0.82)] px-[30px] py-4 backdrop-blur-[12px]">
      <div className="flex items-center gap-[11px]">
        <div className="h-[18px] w-[18px] rotate-45 rounded-[3px] bg-mint" />
        <span className="font-mono text-xs tracking-[2.5px] text-soft">
          ALLOMINATI
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <a
          href="/terminal"
          className="rounded-lg border border-line bg-transparent px-3 py-2 font-mono text-[11px] tracking-[1px] text-dim no-underline hover:text-soft"
        >
          TERMINAL
        </a>
        {isAdmin && (
          <button
            onClick={onToggleAdmin}
            className="cursor-pointer rounded-lg border border-line bg-transparent px-3 py-2 font-mono text-[11px] tracking-[1px] text-dim"
          >
            ADMIN
          </button>
        )}
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button
              onClick={show}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-chip px-[13px] py-2 font-mono text-[12.5px] text-soft"
            >
              <span className="h-[7px] w-[7px] rounded-full bg-mint" />
              {shortAddress(address)}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const labels = ["Choose", "Allocate", "Send-off", "Review"];
  return (
    <div className="flex items-center justify-center gap-2 px-5 pt-5 pb-1">
      {labels.map((label, i) => {
        const n = i + 1;
        const isCur = n === current;
        const done = n < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className="flex items-center gap-[7px] font-mono text-[11px] tracking-[0.5px]"
              style={{
                color: isCur ? "#eef1f5" : done ? "#46d6a6" : "#5f6878",
              }}
            >
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]"
                style={{
                  borderColor: isCur || done ? "#46d6a6" : "#39414e",
                  background: done ? "#46d6a6" : "transparent",
                  color: done ? "#06120d" : isCur ? "#46d6a6" : "#5f6878",
                }}
              >
                {done ? "✓" : n}
              </span>
              {label}
            </span>
            {i < labels.length - 1 && (
              <span className="h-px w-[26px] bg-line" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ClaimSession({ address }: { address: string }) {
  const { claimable: nfts, excludedCount, isLoading: nftsLoading } = useOwnedNfts();
  const { projects } = useProjects();
  const closesAt = useClosesAt();
  const isAdmin = useIsAdmin();
  const claim = useClaim();
  const admin = useAdminActions();

  const [screen, setScreen] = useState<Screen>("portfolio");
  const [alloc, setAlloc] = useState<Alloc>({});
  const [activeDest, setActiveDest] = useState<string>(REFUND);
  const [ackBurn, setAckBurn] = useState(false);
  const [ackRisk, setAckRisk] = useState(false);
  const [finalStep, setFinalStep] = useState(3);
  const [showAdmin, setShowAdmin] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [sendoffMsg, setSendoffMsg] = useState("");

  const activeProjects = projects.filter((p) => p.active !== false);

  // A failed/rejected transaction drops the user back on review with the error shown.
  const effectiveScreen: Screen =
    screen === "processing" && claim.status === "error" ? "review" : screen;

  // Derive the stepper position from the real transaction lifecycle.
  const txStep =
    claim.status === "wallet" ? 1 : claim.status === "pending" ? 2 : claim.status === "success" ? finalStep : 1;

  const goto = (s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  };

  // Once confirmed on-chain, walk the last two steps and show the receipt.
  useEffect(() => {
    if (screen !== "processing" || claim.status !== "success") return;
    const t1 = setTimeout(() => setFinalStep(4), 800);
    const t2 = setTimeout(() => {
      setScreen("receipt");
      window.scrollTo(0, 0);
    }, 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [screen, claim.status]);

  const assign = (id: string) => {
    setAlloc((a) => {
      const next = { ...a };
      if (next[id] === activeDest) delete next[id];
      else next[id] = activeDest;
      return next;
    });
  };

  const confirmClaim = () => {
    const entries = Object.entries(alloc);
    const tokenIds = entries.map(([id]) => BigInt(id));
    const dests = entries.map(([, dest]) => (dest === REFUND ? 0n : BigInt(dest)));
    setFinalStep(3);
    goto("processing");
    void claim.submit(tokenIds, dests);
  };

  const resetClaim = () => {
    claim.reset();
    setAlloc({});
    setAckBurn(false);
    setAckRisk(false);
    setFinalStep(3);
    setActiveDest(REFUND);
    setSendoffMsg("");
    goto("portfolio");
  };

  const addProject = async () => {
    if (!draft.name.trim() || !isAddress(draft.payout)) return;
    await admin.registerProject(
      draft.name.trim(),
      draft.tag.trim() || "Project",
      draft.desc.trim() || "No description provided.",
      draft.payout,
    );
    setDraft(EMPTY_DRAFT);
  };

  if (showAdmin && isAdmin) {
    return (
      <AdminConsole
        projects={projects}
        draft={draft}
        showRisk={CONFIG.showRiskLevel}
        pending={admin.pending}
        onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onAddProject={() => void addProject()}
        onRemoveProject={(id) => void admin.setProjectActive(BigInt(id), false)}
        onRestoreProject={(id) => void admin.setProjectActive(BigInt(id), true)}
        onExit={() => setShowAdmin(false)}
      />
    );
  }

  return (
    <>
      <TopBar
        address={address}
        isAdmin={isAdmin}
        onToggleAdmin={() => setShowAdmin(true)}
      />
      <Stepper current={STEP_ORDER[effectiveScreen] ?? 1} />

      {effectiveScreen === "portfolio" && (
        <PortfolioScreen
          nfts={nfts}
          excludedCount={excludedCount}
          loading={nftsLoading}
          closesAt={closesAt}
          onBuild={() => goto("allocate")}
        />
      )}

      {effectiveScreen === "allocate" && (
        <AllocateScreen
          nfts={nfts}
          projects={activeProjects}
          alloc={alloc}
          activeDest={activeDest}
          refundEnabled={CONFIG.refundEnabled}
          showRisk={CONFIG.showRiskLevel}
          onAssign={assign}
          onPickDest={setActiveDest}
          onBack={() => goto("portfolio")}
          onReview={() => goto("sendoff")}
        />
      )}

      {effectiveScreen === "sendoff" && (
        <SendoffScreen
          address={address}
          message={sendoffMsg}
          onMessageChange={setSendoffMsg}
          onContinue={() => goto("review")}
        />
      )}

      {effectiveScreen === "review" && (
        <ReviewScreen
          nfts={nfts}
          projects={activeProjects}
          alloc={alloc}
          address={shortAddress(address)}
          ackBurn={ackBurn}
          ackRisk={ackRisk}
          showRisk={CONFIG.showRiskLevel}
          claimError={claim.status === "error" ? claim.error : null}
          onToggleBurn={() => setAckBurn((v) => !v)}
          onToggleRisk={() => setAckRisk((v) => !v)}
          onEdit={() => goto("allocate")}
          onConfirm={confirmClaim}
        />
      )}

      {effectiveScreen === "processing" && <ProcessingScreen txStep={txStep} />}

      {effectiveScreen === "receipt" && (
        <ReceiptScreen
          nfts={nfts}
          projects={activeProjects}
          alloc={alloc}
          txHash={claim.hash}
          onReset={resetClaim}
        />
      )}
    </>
  );
}

export default function DualClaimApp() {
  const { address, isConnected } = useAccount();

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {!isConnected || !address ? (
        <ConnectScreen />
      ) : (
        // Keyed by address: switching or reconnecting wallets resets the session.
        <ClaimSession key={address} address={address} />
      )}
    </div>
  );
}
