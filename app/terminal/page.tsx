import type { Metadata } from "next";
import TerminalScreen from "../components/terminal-screen";

export const metadata: Metadata = {
  title: "Allominati — Vault Terminal",
  description:
    "Live read-only view of the Allominati redemption vault: pool balance, redemptions, project outflows, and the full event log.",
};

export default function TerminalPage() {
  return <TerminalScreen />;
}
