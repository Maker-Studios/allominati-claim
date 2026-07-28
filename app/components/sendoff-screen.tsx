"use client";

import { useState } from "react";
import { useSignMessage } from "wagmi";
import { privateKeyToAccount } from "viem/accounts";
import { useImpersonation } from "../lib/onchain/impersonation";
import { sendoffSignPayload } from "../lib/sendoff";

// anvil dev account 0 — public knowledge, local fork only. Impersonated
// accounts have no key, so they sign with this one; setup-anvil etches an
// ERC-1271 shim onto them that accepts its signatures.
const DEV_SIGNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

interface Props {
  address: string;
  message: string;
  onMessageChange: (value: string) => void;
  onContinue: () => void;
}

type ShipStage = "idle" | "signing" | "sending";

export default function SendoffScreen({
  address,
  message,
  onMessageChange,
  onContinue,
}: Props) {
  const { signMessageAsync } = useSignMessage();
  const { account: impersonated } = useImpersonation();
  const [stage, setStage] = useState<ShipStage>("idle");
  const [error, setError] = useState<string | null>(null);

  const canShip = message.trim().length > 0 && stage === "idle";

  const ship = async () => {
    const text = message.trim();
    setError(null);
    try {
      // The signature proves the message really comes from this holder; the
      // backend verifies it before storing. Impersonated dev sessions sign
      // with the anvil dev key, verified through the account's 1271 shim.
      setStage("signing");
      const payload = sendoffSignPayload(address, text);
      const signature = impersonated
        ? await privateKeyToAccount(DEV_SIGNER_KEY).signMessage({ message: payload })
        : await signMessageAsync({ message: payload });
      setStage("sending");
      const res = await fetch("/api/sendoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message: text, signature }),
      });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      onContinue();
    } catch {
      setError(
        "couldn't sign or send your message — try again, or continue below.",
      );
      setStage("idle");
    }
  };

  return (
    <div className="mx-auto grid max-w-[1180px] animate-fade-up grid-cols-[1.1fr_1fr] items-start gap-[46px] px-[30px] pt-9 pb-20 max-lg:grid-cols-1">
      {/* the letter */}
      <div>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-3 w-3 rotate-45 rounded-[2px] bg-mint" />
          <span className="font-mono text-[11px] tracking-[3.5px] text-mint">
            A NOTE FROM KEVIN
          </span>
        </div>
        <h1 className="mb-6 text-[32px] font-semibold leading-[1.3] tracking-[-0.5px]">
          hey. before you claim, i wanted to say something to you directly.
        </h1>
        <p className="mb-5 text-[15.5px] leading-[1.75] text-muted">
          thank you for being part of the{" "}
          <a
            href="https://allo.capital"
            target="_blank"
            rel="noreferrer"
            className="text-mint no-underline hover:underline"
          >
            allo.capital
          </a>{" "}
          journey. you didn&apos;t
          just buy an nft, you backed a thesis: that we could build better ways
          to allocate capital using networks. imo that thesis is still right,
          even though this particular vehicle didn&apos;t get us there.
        </p>
        <p className="mb-6 text-[15.5px] leading-[1.75] text-muted">
          our execution wasn&apos;t perfect. i know it and you know it. some of
          that was market, some of that was timing, and some of that was on me.
          so thanks for your grace. seriously. the way this community has
          handled a wind-down has been very gracious.
        </p>
        <p className="mb-8 text-[16px] font-semibold text-fg">
          i see you. i appreciate you. onward.
        </p>
        <div className="flex items-center gap-3.5">
          <span className="h-px w-9 bg-line-2" />
          <span className="text-[17px] font-semibold">kevin</span>
        </div>
      </div>

      {/* say something back */}
      <div>
        <div className="rounded-2xl border border-line bg-panel p-7">
          <h2 className="mb-3.5 text-[22px] font-semibold tracking-[-0.3px]">
            say something back
          </h2>
          <p className="mb-4 text-[13.5px] leading-[1.7] text-muted">
            this is a two-way door. tell me what you actually think: feedback,
            learnings, grievances, gratitude. &ldquo;kevin you suck, thanks for
            half my money back&rdquo; is a valid entry. so is the thing you
            learned that you&apos;ll carry forward.
          </p>
          <p className="mb-5 text-[13.5px] leading-[1.7] text-muted">
            have a think on what you learned. what you&apos;re carrying
            forward. then let me know. if i get enough interesting responses,
            i&apos;m going to weave these messages into a piece of art that
            commemorates the{" "}
            <a
              href="https://allo.capital"
              target="_blank"
              rel="noreferrer"
              className="text-mint no-underline hover:underline"
            >
              allo.capital
            </a>{" "}
            journey. by submitting, you&apos;re
            cool with your words/address being part of it.
          </p>
          <label
            htmlFor="sendoff-message"
            className="mb-2 block font-mono text-[11px] tracking-[1.5px] text-dim"
          >
            your message to kevin + rest of allominati
          </label>
          <textarea
            id="sendoff-message"
            rows={5}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="what you felt, what you learned, what we should do differently next time..."
            className="w-full resize-y rounded-[11px] border border-line-2 bg-panel-2 px-4 py-3.5 font-sans text-sm leading-[1.6] text-fg outline-none placeholder:text-dim focus:border-mint"
          />
          {error && (
            <div className="mt-2 text-[12.5px] leading-[1.5] text-[#e6b0b0]">
              {error}
            </div>
          )}
          <button
            onClick={() => void ship()}
            disabled={!canShip}
            className="mt-4 w-full rounded-[11px] py-[15px] font-sans text-[15px] font-semibold"
            style={{
              background: canShip ? "#46d6a6" : "#1e232b",
              color: canShip ? "#06120d" : "#5f6878",
              cursor: canShip ? "pointer" : "not-allowed",
              opacity: canShip ? 1 : 0.7,
            }}
          >
            {stage === "signing"
              ? "sign in your wallet…"
              : stage === "sending"
                ? "shipping…"
                : "sign & ship it"}
          </button>
          <p className="mt-3 text-center font-mono text-[11px] leading-[1.6] tracking-[0.5px] text-dim">
            you&apos;ll be asked to sign the message — it proves it&apos;s
            yours and costs nothing.
          </p>
        </div>
        <p className="mt-5 text-center font-mono text-[12px] tracking-[0.5px] text-dim">
          nothing to say? no hard feelings.{" "}
          <button
            onClick={onContinue}
            className="cursor-pointer border-none bg-transparent p-0 font-mono text-[12px] tracking-[0.5px] text-mint"
          >
            → continue to claim
          </button>
        </p>
      </div>
    </div>
  );
}
