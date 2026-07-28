import {
  type Draft,
  type Project,
  type Risk,
  fmt,
  riskColor,
  riskLabel,
  shortAddress,
} from "../lib/dual-claim";

const RISKS: Risk[] = ["low", "medium", "high"];

const inputCls =
  "w-full rounded-[9px] border border-line-2 bg-ink px-[13px] py-[11px] font-sans text-sm text-fg outline-none focus:border-line-4";

const labelCls =
  "mb-1.5 block font-mono text-[10.5px] tracking-[1px] text-muted";

interface Props {
  projects: Project[];
  draft: Draft;
  showRisk: boolean;
  pending: boolean;
  onDraftChange: (patch: Partial<Draft>) => void;
  onAddProject: () => void;
  onRemoveProject: (id: string) => void;
  onRestoreProject: (id: string) => void;
  onExit: () => void;
}

export default function AdminConsole({
  projects,
  draft,
  showRisk,
  pending,
  onDraftChange,
  onAddProject,
  onRemoveProject,
  onRestoreProject,
  onExit,
}: Props) {
  return (
    <div className="mx-auto max-w-[1080px] px-[34px] pt-[30px] pb-20">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-[11px]">
          <div className="h-[18px] w-[18px] rotate-45 rounded-[3px] bg-blue" />
          <span className="font-mono text-xs tracking-[2.5px] whitespace-nowrap text-muted">
            PROJECT CONSOLE
          </span>
        </div>
        <button
          onClick={onExit}
          className="cursor-pointer rounded-lg border border-line-2 bg-transparent px-[15px] py-[9px] font-mono text-[11.5px] tracking-[1.5px] text-soft"
        >
          ← EXIT
        </button>
      </div>
      <h1 className="mt-3.5 mb-1.5 text-[34px] font-semibold tracking-[-1px]">
        Listed projects
      </h1>
      <p className="mb-[30px] text-[15px] text-muted">
        Holders can route redeemed value into anything listed here. Every
        change is an on-chain transaction and appears in the claim flow once
        confirmed.
      </p>

      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-[26px] max-md:grid-cols-1">
        <div className="flex flex-col gap-3.5">
          {projects.map((p) => {
            const inactive = p.active === false;
            return (
              <div
                key={p.id}
                className="rounded-[14px] border border-line bg-panel px-5 py-[18px]"
                style={inactive ? { opacity: 0.55 } : undefined}
              >
                <div className="flex items-start justify-between gap-3.5">
                  <div>
                    <div className="mb-[7px] flex items-center gap-[9px]">
                      <span className="rounded-[5px] border border-line-2 bg-raise px-2 py-[3px] font-mono text-[10px] tracking-[1.5px] text-muted">
                        {p.tag}
                      </span>
                      {inactive && (
                        <span className="font-mono text-[10px] tracking-[1px] text-amber">
                          ● Deactivated
                        </span>
                      )}
                      {showRisk && !inactive && (
                        <span
                          className="font-mono text-[10px] tracking-[1px]"
                          style={{ color: riskColor(p.risk) }}
                        >
                          ● {riskLabel(p.risk)}
                        </span>
                      )}
                    </div>
                    <div className="text-[17px] font-semibold">{p.name}</div>
                    <div className="mt-[5px] max-w-[46ch] text-[13.5px] leading-[1.5] text-muted">
                      {p.desc}
                    </div>
                    {p.payout && (
                      <div className="mt-[7px] font-mono text-[11px] text-dim">
                        PAYOUT {shortAddress(p.payout)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      inactive ? onRestoreProject(p.id) : onRemoveProject(p.id)
                    }
                    disabled={pending}
                    title={inactive ? "Reactivate project" : "Deactivate project"}
                    className="flex-none cursor-pointer rounded-lg border border-line-2 bg-transparent px-2.5 py-1.5 font-mono text-[10px] tracking-[1px] text-dim disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {inactive ? "RESTORE" : "DEACTIVATE"}
                  </button>
                </div>
                <div className="mt-[15px] flex items-center justify-end">
                  <span className="font-mono text-xs text-soft">
                    {fmt(p.raised)} WETH raised
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky top-6 rounded-[14px] border border-line bg-panel p-[22px]">
          <div className="mb-[18px] text-base font-semibold">
            List a new project
          </div>
          <label className={labelCls}>NAME</label>
          <input
            value={draft.name}
            onChange={(e) => onDraftChange({ name: e.target.value })}
            placeholder="Project name"
            className={`${inputCls} mb-3.5`}
          />
          <label className={labelCls}>TAG</label>
          <input
            value={draft.tag}
            onChange={(e) => onDraftChange({ tag: e.target.value })}
            placeholder="DeFi"
            className={`${inputCls} mb-3.5`}
          />
          <label className={labelCls}>PAYOUT ADDRESS</label>
          <input
            value={draft.payout}
            onChange={(e) => onDraftChange({ payout: e.target.value })}
            placeholder="0x…"
            className={`${inputCls} mb-3.5 font-mono`}
          />
          <label className={labelCls}>DESCRIPTION</label>
          <textarea
            value={draft.desc}
            onChange={(e) => onDraftChange({ desc: e.target.value })}
            placeholder="What does this fund?"
            rows={3}
            className={`${inputCls} mb-3.5 resize-y`}
          />
          {showRisk && (
            <>
              <label className="mb-2 block font-mono text-[10.5px] tracking-[1px] text-muted">
                RISK LEVEL
              </label>
              <div className="mb-5 flex gap-2">
                {RISKS.map((r) => {
                  const sel = draft.risk === r;
                  const c = riskColor(r);
                  return (
                    <button
                      key={r}
                      onClick={() => onDraftChange({ risk: r })}
                      className="flex-1 cursor-pointer rounded-lg border py-[9px] font-mono text-[11px] tracking-[1px]"
                      style={{
                        background: sel ? "rgba(70,214,166,0.06)" : "#0c0e12",
                        borderColor: sel ? c : "#313846",
                        color: sel ? c : "#9aa3b2",
                      }}
                    >
                      {r.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <button
            onClick={onAddProject}
            disabled={pending}
            className="w-full cursor-pointer rounded-[10px] bg-blue py-[13px] font-sans text-[15px] font-semibold text-blue-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Confirming on-chain…" : "Publish project"}
          </button>
        </div>
      </div>
    </div>
  );
}
