import {
  type Alloc,
  type Nft,
  type Project,
  CONFIG,
  committedTo,
  fmt,
  riskLabel,
  summarizeClaim,
} from "../lib/dual-claim";

interface Props {
  nfts: Nft[];
  projects: Project[];
  alloc: Alloc;
  address: string | null;
  ackBurn: boolean;
  ackRisk: boolean;
  showRisk: boolean;
  claimError: string | null;
  onToggleBurn: () => void;
  onToggleRisk: () => void;
  onEdit: () => void;
  onConfirm: () => void;
}

function AckCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className="mt-[13px] flex cursor-pointer items-center gap-[11px]"
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-md text-[13px] text-mint-ink"
        style={{
          border: `1.5px solid ${checked ? "#46d6a6" : "#39414e"}`,
          background: checked ? "#46d6a6" : "transparent",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span className="text-[13.5px] text-fg">{label}</span>
    </div>
  );
}

export default function ReviewScreen({
  nfts,
  projects,
  alloc,
  address,
  ackBurn,
  ackRisk,
  showRisk,
  claimError,
  onToggleBurn,
  onToggleRisk,
  onEdit,
  onConfirm,
}: Props) {
  const { refundCount, refundTotal, investTotal, assignedCount } =
    summarizeClaim(nfts, alloc);

  const committedProjects = projects
    .map((p) => ({ project: p, ...committedTo(nfts, alloc, p.id) }))
    .filter((c) => c.count > 0);

  const hasRefund = refundCount > 0;
  const hasInvest = investTotal > 0;
  const burnOk = !hasRefund || !CONFIG.requireBurnAck || ackBurn;
  const riskOk = !hasInvest || !CONFIG.requireRiskAck || ackRisk;
  const confirmOk = assignedCount > 0 && burnOk && riskOk;

  return (
    <div className="mx-auto max-w-[780px] animate-fade-up px-[30px] pt-6 pb-20">
      <h1 className="mb-1.5 text-[30px] font-semibold tracking-[-0.5px]">
        Review your claim
      </h1>
      <p className="mb-7 text-[14.5px] text-muted">
        Confirm what happens to each NFT. Nothing executes until you sign.
      </p>

      {hasRefund && (
        <div className="mb-[18px] rounded-2xl border border-[#243042] bg-panel p-6">
          <div className="mb-[18px] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-[11px] w-[11px] rounded-full bg-blue" />
              <span className="text-lg font-semibold">Refund to wallet</span>
            </div>
            <span className="font-mono text-2xl text-blue">
              {fmt(refundTotal)} WETH
            </span>
          </div>
          <div className="flex flex-col gap-px font-mono text-[13px]">
            <div className="flex justify-between border-b border-line-3 py-[9px]">
              <span className="text-muted">NFTs redeemed</span>
              <span>{refundCount}</span>
            </div>
            <div className="flex justify-between border-b border-line-3 py-[9px]">
              <span className="text-muted">Sent to</span>
              <span>{address}</span>
            </div>
            <div className="flex justify-between py-[9px]">
              <span className="text-muted">You receive</span>
              <span className="text-blue">{fmt(refundTotal)} WETH</span>
            </div>
          </div>
          <div className="mt-4 rounded-[11px] border border-[rgba(240,163,94,0.3)] bg-[rgba(240,163,94,0.08)] px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <span className="text-base leading-[1.2] text-amber">⚠</span>
              <div className="text-[13.5px] leading-[1.5] text-[#e6cdb0]">
                Redemption is <b>irreversible</b>. The soulbound NFT stays in
                your wallet, but once redeemed its claim value is spent forever
                — these {refundCount} NFT{refundCount === 1 ? "" : "s"} can
                never be redeemed again.
              </div>
            </div>
            {CONFIG.requireBurnAck && (
              <AckCheckbox
                checked={ackBurn}
                onToggle={onToggleBurn}
                label="I understand redemption is permanent and cannot be undone."
              />
            )}
          </div>
        </div>
      )}

      {hasInvest && (
        <div className="mb-[18px] rounded-2xl border border-[#1f3b30] bg-panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-0 w-0 border-r-6 border-b-[11px] border-l-6 border-r-transparent border-b-mint border-l-transparent" />
              <span className="text-lg font-semibold">Investments</span>
            </div>
            <span className="font-mono text-2xl text-mint">
              {fmt(investTotal)} WETH
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {committedProjects.map(({ project, count, total }) => (
              <div
                key={project.id}
                className="flex items-center justify-between rounded-[11px] border border-line-3 bg-panel-2 px-[15px] py-[13px]"
              >
                <div>
                  <div className="text-[15px] font-semibold">
                    {project.name}
                  </div>
                  <div className="mt-[3px] font-mono text-[11.5px] text-muted">
                    {count} NFT{count > 1 ? "s" : ""}
                    {showRisk ? ` · ${riskLabel(project.risk)}` : ""}
                    {project.ret ? ` · ${project.ret}` : ""}
                  </div>
                </div>
                <span className="font-mono text-base text-mint">
                  {fmt(total)} WETH
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[11px] border border-line bg-[rgba(154,163,178,0.06)] px-4 py-3.5">
            <div className="text-[13.5px] leading-[1.5] text-[#bcc4d0]">
              Invested capital is <b>at risk</b>. Returns are not guaranteed,
              projects may fail, and committed WETH may be locked for the
              project&apos;s duration.
            </div>
            {CONFIG.requireRiskAck && (
              <AckCheckbox
                checked={ackRisk}
                onToggle={onToggleRisk}
                label="I accept the risks of these projects."
              />
            )}
          </div>
        </div>
      )}

      {claimError && (
        <div className="mt-[18px] rounded-[11px] border border-[rgba(240,94,94,0.35)] bg-[rgba(240,94,94,0.08)] px-4 py-3.5 text-[13.5px] leading-[1.5] text-[#e6b0b0]">
          Transaction failed: {claimError}
        </div>
      )}

      <div className="mt-[26px] flex items-center justify-between gap-3.5">
        <button
          onClick={onEdit}
          className="cursor-pointer rounded-[11px] border border-line-2 bg-transparent px-[22px] py-3.5 font-sans text-sm text-soft"
        >
          ← Edit allocation
        </button>
        <button
          onClick={onConfirm}
          disabled={!confirmOk}
          className="max-w-[340px] flex-1 rounded-[11px] py-[15px] font-sans text-[15px] font-semibold"
          style={{
            background: confirmOk ? "#46d6a6" : "#1e232b",
            color: confirmOk ? "#06120d" : "#5f6878",
            cursor: confirmOk ? "pointer" : "not-allowed",
            opacity: confirmOk ? 1 : 0.7,
          }}
        >
          Sign &amp; confirm claim
        </button>
      </div>
    </div>
  );
}
