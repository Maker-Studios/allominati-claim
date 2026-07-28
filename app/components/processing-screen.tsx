const TX_LABELS = [
  "Confirming in wallet",
  "Submitting transaction",
  "Redeeming NFTs & routing funds",
  "Finalizing on-chain",
];

export default function ProcessingScreen({ txStep }: { txStep: number }) {
  return (
    <div className="mx-auto max-w-[520px] px-[30px] py-20 text-center">
      <div className="mx-auto mb-[30px] h-[54px] w-[54px] animate-spin rounded-full border-[3px] border-raise border-t-mint" />
      <h1 className="mb-7 text-2xl font-semibold">Processing your claim</h1>
      <div className="flex flex-col gap-[13px] text-left">
        {TX_LABELS.map((label, i) => {
          const done = txStep > i + 1;
          const active = txStep === i + 1;
          return (
            <div
              key={label}
              className="flex items-center gap-[13px] rounded-[11px] bg-panel px-4 py-[13px]"
              style={{ border: `1px solid ${active ? "#2c4339" : "#1c2128"}` }}
            >
              <span
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs text-mint-ink"
                style={{
                  background: done ? "#46d6a6" : "transparent",
                  border: `1.5px solid ${done || active ? "#46d6a6" : "#39414e"}`,
                }}
              >
                {done ? "✓" : ""}
              </span>
              <span
                className="font-mono text-[13.5px]"
                style={{ color: done || active ? "#eef1f5" : "#5f6878" }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
