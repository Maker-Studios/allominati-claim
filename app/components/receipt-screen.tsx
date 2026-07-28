import {
  type Alloc,
  type Nft,
  type Project,
  committedTo,
  fmt,
  shortAddress,
  summarizeClaim,
} from "../lib/dual-claim";
import { IS_LOCAL } from "../lib/onchain/addresses";

interface Props {
  nfts: Nft[];
  projects: Project[];
  alloc: Alloc;
  txHash: string | null;
  onReset: () => void;
}

export default function ReceiptScreen({ nfts, projects, alloc, txHash, onReset }: Props) {
  const { refundCount, refundTotal } = summarizeClaim(nfts, alloc);

  const lines: { label: string; amount: string; color: string }[] = [];
  if (refundCount > 0) {
    lines.push({
      label: `${refundCount} NFT${refundCount > 1 ? "s" : ""} redeemed → refund`,
      amount: `${fmt(refundTotal)} WETH`,
      color: "#5b9dff",
    });
  }
  for (const p of projects) {
    const com = committedTo(nfts, alloc, p.id);
    if (com.count > 0) {
      lines.push({
        label: `Invested in ${p.name}`,
        amount: `${fmt(com.total)} WETH`,
        color: "#46d6a6",
      });
    }
  }

  return (
    <div className="mx-auto max-w-[560px] animate-fade-up px-[30px] pt-[60px] pb-20 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(70,214,166,0.14)]">
        <span className="text-[32px] text-mint">✓</span>
      </div>
      <h1 className="mb-2 text-[28px] font-semibold tracking-[-0.5px]">
        Claim complete
      </h1>
      <p className="mb-8 text-[15px] text-muted">
        Your transactions are confirmed on-chain.
      </p>

      <div className="mb-[18px] rounded-2xl border border-line bg-panel p-[22px] text-left">
        {lines.map((line) => (
          <div
            key={line.label}
            className="flex items-center justify-between gap-3.5 border-b border-line-3 py-[13px]"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="h-[9px] w-[9px] rounded-full"
                style={{ background: line.color }}
              />
              <span className="text-sm">{line.label}</span>
            </div>
            <span
              className="font-mono text-sm"
              style={{ color: line.color }}
            >
              {line.amount}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-3.5 pb-1">
          <span className="font-mono text-[11px] tracking-[1px] text-dim">
            TX
          </span>
          {txHash && !IS_LOCAL ? (
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[12.5px] text-blue underline-offset-2 hover:underline"
            >
              {shortAddress(txHash)}
            </a>
          ) : (
            <span className="font-mono text-[12.5px] text-blue" title={txHash ?? ""}>
              {txHash ? shortAddress(txHash) : "—"}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onReset}
        className="cursor-pointer rounded-[11px] border border-line-2 bg-transparent px-7 py-3.5 font-sans text-[15px] font-semibold text-soft"
      >
        Back to portfolio
      </button>
    </div>
  );
}
