import type { Metadata } from "next";
import { ComingSoon } from "../_components/coming-soon";

export const metadata: Metadata = { title: "Rates" };

export default function Page() {
  return <ComingSoon title="Rates" issue={14} />;
}
