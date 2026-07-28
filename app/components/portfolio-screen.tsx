import Image from "next/image";
import { type Nft, fmt } from "../lib/dual-claim";

const nftArt =
  "bg-[repeating-linear-gradient(135deg,#171b22,#171b22_9px,#1c212a_9px,#1c212a_18px)]";

interface Props {
  nfts: Nft[];
  excludedCount: number;
  loading: boolean;
  closesAt: Date | null;
  onBuild: () => void;
}

export default function PortfolioScreen({ nfts, excludedCount, loading, closesAt, onBuild }: Props) {
  const totalClaimable = fmt(nfts.reduce((a, n) => a + n.value, 0));

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] px-[30px] pt-[60px] pb-20 text-center">
        <div className="mx-auto mb-5 h-[38px] w-[38px] animate-spin rounded-full border-[3px] border-raise border-t-mint" />
        <div className="font-mono text-xs tracking-[2px] text-muted">
          READING YOUR POSITION ON-CHAIN…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] animate-fade-up px-[30px] pt-[30px] pb-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-[22px]">
        <div>
          <div className="mb-2.5 font-mono text-xs tracking-[2px] text-muted">
            YOUR POSITION
          </div>
          <h1 className="text-[38px] font-semibold tracking-[-1px]">
            {nfts.length} Allominati NFT{nfts.length === 1 ? "" : "s"}
          </h1>
          {excludedCount > 0 && (
            <div className="mt-2 font-mono text-[11.5px] text-dim">
              {excludedCount} token{excludedCount === 1 ? "" : "s"} excluded
              (already redeemed or no redeemable value)
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="mb-1.5 font-mono text-xs tracking-[1px] text-muted">
            REDEEMABLE VALUE
          </div>
          <div className="font-mono text-[34px] font-semibold text-mint">
            {totalClaimable} WETH
          </div>
          {closesAt && (
            <div className="mt-1.5 font-mono text-[11.5px] text-dim">
              WINDOW CLOSES{" "}
              {closesAt.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              }).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      <div className="mb-10 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
        {nfts.map((n) => (
          <div
            key={n.id}
            className="overflow-hidden rounded-[13px] border border-line bg-panel"
          >
            <div
              className={`relative flex aspect-square items-center justify-center ${nftArt}`}
            >
              {n.image && (
                <Image
                  src={n.image}
                  alt={`Allominati #${n.id}`}
                  fill
                  sizes="200px"
                  className="object-cover"
                />
              )}
              <span
                className={
                  n.image
                    ? "absolute bottom-2 left-2 rounded-md bg-[rgba(10,12,16,0.75)] px-2 py-1 font-mono text-xs text-mint backdrop-blur-sm"
                    : "font-mono text-lg text-mint opacity-85"
                }
              >
                #{n.id}
              </span>
            </div>
            <div className="flex items-center justify-between px-[13px] py-[11px]">
              <span className="font-mono text-[11px] text-dim">
                ALLO
              </span>
              <span className="font-mono text-[13px] text-soft">
                {fmt(n.value)} WETH
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-[34px] grid grid-cols-2 gap-[18px] max-md:grid-cols-1">
        <div className="rounded-2xl border border-[#243042] bg-[linear-gradient(160deg,#14181f,#121519)] p-6">
          <div className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[rgba(91,157,255,0.14)]">
            <div className="h-[13px] w-[13px] rounded-full border-2 border-blue" />
          </div>
          <div className="mb-2 text-[19px] font-semibold">Redeem for WETH</div>
          <div className="text-sm leading-[1.55] text-muted">
            Trade an NFT back to the vault and receive its original mint value.
            The token is burned — this is final.
          </div>
        </div>
        <div className="rounded-2xl border border-[#1f3b30] bg-[linear-gradient(160deg,#13191a,#111615)] p-6">
          <div className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[rgba(70,214,166,0.14)]">
            <div className="h-0 w-0 border-r-[7px] border-b-[12px] border-l-[7px] border-r-transparent border-b-mint border-l-transparent" />
          </div>
          <div className="mb-2 text-[19px] font-semibold">
            Invest in a project
          </div>
          <div className="text-sm leading-[1.55] text-muted">
            Route an NFT&apos;s value into any project listed by the vault. Mix
            and match across as many as you like.
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={onBuild}
          disabled={nfts.length === 0}
          className="inline-flex cursor-pointer items-center gap-[11px] rounded-xl bg-mint px-[34px] py-4 text-base font-semibold text-mint-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Build your claim →
        </button>
      </div>
    </div>
  );
}
