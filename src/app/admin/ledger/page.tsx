import type { Metadata } from "next";
import { ComingSoon } from "../_components/coming-soon";

export const metadata: Metadata = { title: "Ledger" };

export default function Page() {
  return <ComingSoon title="Ledger" issue={18} />;
}
