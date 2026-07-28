import Image from "next/image";
import {
  type Alloc,
  type Nft,
  type Project,
  REFUND,
  committedTo,
  fmt,
  riskColor,
  riskLabel,
  summarizeClaim,
} from "../lib/dual-claim";

const nftArt =
  "bg-[repeating-linear-gradient(135deg,#171b22,#171b22_9px,#1c212a_9px,#1c212a_18px)]";

interface Props {
  nfts: Nft[];
  projects: Project[];
  alloc: Alloc;
  activeDest: string;
  refundEnabled: boolean;
  showRisk: boolean;
  onAssign: (id: string) => void;
  onPickDest: (dest: string) => void;
  onBack: () => void;
  onReview: () => void;
}

export default function AllocateScreen({
  nfts,
  projects,
  alloc,
  activeDest,
  refundEnabled,
  showRisk,
  onAssign,
  onPickDest,
  onBack,
  onReview,
}: Props) {
  const { refundCount, refundTotal, investTotal, assignedCount, unassignedCount } =
    summarizeClaim(nfts, alloc);
  const canReview = assignedCount > 0;
  const refundActive = activeDest === REFUND;

  return (
    <>
      <div className="mx-auto max-w-[1180px] animate-fade-up px-[30px] pt-[22px] pb-[130px]">
        <div className="mb-[22px]">
          <h1 className="mb-1.5 text-[30px] font-semibold tracking-[-0.5px]">
            Allocate your NFTs
          </h1>
          <p className="text-[14.5px] text-muted">
            <span className="text-mint">1.</span> Pick a destination on the
            right &nbsp;·&nbsp; <span className="text-mint">2.</span> Click
            your NFTs to send them there &nbsp;·&nbsp; click again to unassign.
          </p>
        </div>

        <div className="grid grid-cols-[1.35fr_1fr] items-start gap-[26px] max-lg:grid-cols-1">
          {/* nft grid */}
          <div>
            <div className="mb-[13px] font-mono text-[11px] tracking-[1.5px] text-muted">
              YOUR NFTS · CLICK TO ASSIGN
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-[13px]">
              {nfts.map((n) => {
                const dest = alloc[n.id] ?? null;
                const isRefund = dest === REFUND;
                const proj =
                  dest && !isRefund
                    ? projects.find((p) => p.id === dest)
                    : null;
                const c = isRefund ? "#5b9dff" : proj ? "#46d6a6" : null;
                return (
                  <div
                    key={n.id}
                    onClick={() => onAssign(n.id)}
                    className="cursor-pointer overflow-hidden rounded-[13px] bg-panel transition-[border-color,box-shadow] duration-150"
                    style={{
                      border: `1.5px solid ${c ?? "#262c36"}`,
                      boxShadow: c
                        ? `0 0 0 1px ${c}, 0 6px 22px -10px ${c}`
                        : "none",
                    }}
                  >
                    <div
                      className={`relative flex aspect-[1.35] items-center justify-center ${nftArt}`}
                    >
                      {n.image && (
                        <Image
                          src={n.image}
                          alt={`Allominati #${n.id}`}
                          fill
                          sizes="180px"
                          className="object-cover"
                        />
                      )}
                      <span
                        className={
                          n.image
                            ? "absolute bottom-1.5 left-2 rounded-md bg-[rgba(10,12,16,0.75)] px-1.5 py-0.5 font-mono text-[13px] backdrop-blur-sm"
                            : "font-mono text-[17px]"
                        }
                        style={{ color: c ?? "rgba(70,214,166,0.7)" }}
                      >
                        #{n.id}
                      </span>
                      <span
                        className="absolute top-2 right-[9px] h-4 w-4 rounded-full"
                        style={{
                          border: `1.5px solid ${c ?? "#39414e"}`,
                          background: c ?? "transparent",
                          boxShadow: n.image ? "0 0 0 2px rgba(10,12,16,0.55)" : "none",
                        }}
                      />
                    </div>
                    <div
                      className="flex flex-col gap-0.5 px-3 py-[9px]"
                      style={{
                        background: c
                          ? isRefund
                            ? "rgba(91,157,255,0.07)"
                            : "rgba(70,214,166,0.07)"
                          : "transparent",
                      }}
                    >
                      <span className="font-mono text-[12.5px] text-soft">
                        {fmt(n.value)} WETH
                      </span>
                      <span
                        className="overflow-hidden font-mono text-[10.5px] tracking-[0.5px] text-ellipsis whitespace-nowrap"
                        style={{ color: c ?? "#5f6878" }}
                      >
                        {dest
                          ? isRefund
                            ? "Refund"
                            : (proj?.name ?? "")
                          : "Unassigned"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* destinations */}
          <div className="sticky top-[84px]">
            <div className="mb-[13px] font-mono text-[11px] tracking-[1.5px] text-muted">
              SEND TO
            </div>
            <div className="flex max-h-[62vh] flex-col gap-[11px] overflow-y-auto pr-1">
              {refundEnabled && (
                <div
                  onClick={() => onPickDest(REFUND)}
                  className="cursor-pointer rounded-[13px] px-4 py-[15px]"
                  style={{
                    background: refundActive
                      ? "rgba(91,157,255,0.08)"
                      : "#14171d",
                    border: `1.5px solid ${refundActive ? "#5b9dff" : "#262c36"}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-[9px]">
                      <div className="h-[11px] w-[11px] rounded-full bg-blue" />
                      <span className="text-[15px] font-semibold">
                        Refund to wallet
                      </span>
                    </div>
                    <span
                      className="font-mono text-[10px] tracking-[1px]"
                      style={{ color: refundActive ? "#5b9dff" : "#5f6878" }}
                    >
                      {refundActive ? "ACTIVE" : "SELECT"}
                    </span>
                  </div>
                  <div className="mt-[11px] flex items-baseline justify-between">
                    <span className="font-mono text-xs text-muted">
                      {refundCount} NFT{refundCount === 1 ? "" : "s"}
                    </span>
                    <span className="font-mono text-[17px] text-blue">
                      {fmt(refundTotal)} WETH
                    </span>
                  </div>
                </div>
              )}

              {projects.map((p) => {
                const com = committedTo(nfts, alloc, p.id);
                const projected = p.raised + com.total;
                const active = activeDest === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => onPickDest(p.id)}
                    className="cursor-pointer rounded-[13px] px-4 py-[15px]"
                    style={{
                      background: active ? "rgba(70,214,166,0.08)" : "#14171d",
                      border: `1.5px solid ${active ? "#46d6a6" : "#262c36"}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div>
                        <div className="mb-[5px] flex items-center gap-2">
                          <span className="rounded bg-raise px-1.5 py-0.5 font-mono text-[9.5px] tracking-[1px] text-muted">
                            {p.tag}
                          </span>
                          {showRisk && (
                            <span
                              className="font-mono text-[9.5px]"
                              style={{ color: riskColor(p.risk) }}
                            >
                              ● {riskLabel(p.risk)}
                            </span>
                          )}
                        </div>
                        <div className="text-[14.5px] leading-[1.25] font-semibold">
                          {p.name}
                        </div>
                      </div>
                      <span
                        className="font-mono text-[10px] tracking-[1px] whitespace-nowrap"
                        style={{ color: active ? "#46d6a6" : "#5f6878" }}
                      >
                        {active ? "ACTIVE" : "SELECT"}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-between border-t border-[#20252e] pt-2.5">
                      <span className="font-mono text-[11px] text-muted">
                        {fmt(projected)} WETH raised
                      </span>
                      <span
                        className="font-mono text-[11px]"
                        style={{
                          color: com.total > 0 ? "#46d6a6" : "#5f6878",
                        }}
                      >
                        {com.total > 0 ? `+${fmt(com.total)} WETH` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* summary bar */}
      <div className="fixed right-0 bottom-0 left-0 z-25 border-t border-line bg-[rgba(16,19,24,0.92)] px-[30px] py-4 backdrop-blur-[14px]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-[26px]">
            <div>
              <div className="font-mono text-[10px] tracking-[1px] text-dim">
                REFUND
              </div>
              <div className="font-mono text-base text-blue">
                {fmt(refundTotal)} WETH
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[1px] text-dim">
                INVESTED
              </div>
              <div className="font-mono text-base text-mint">
                {fmt(investTotal)} WETH
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[1px] text-dim">
                UNASSIGNED
              </div>
              <div className="font-mono text-base text-soft">
                {unassignedCount}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="cursor-pointer rounded-[11px] border border-line-2 bg-transparent px-5 py-[13px] font-sans text-sm text-soft"
            >
              Back
            </button>
            <button
              onClick={onReview}
              disabled={!canReview}
              className="rounded-[11px] px-[26px] py-[13px] font-sans text-[15px] font-semibold"
              style={{
                background: canReview ? "#46d6a6" : "#1e232b",
                color: canReview ? "#06120d" : "#5f6878",
                cursor: canReview ? "pointer" : "not-allowed",
                opacity: canReview ? 1 : 0.7,
              }}
            >
              Review claim →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
