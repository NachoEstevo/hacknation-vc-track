import type { Metadata } from "next";
import { CompareWorkspace } from "./compare-workspace";

export const metadata: Metadata = {
  title: "Compare opportunities",
  description: "Side-by-side evidence comparison without a composite investment score.",
};

export default function ComparePage() {
  return <CompareWorkspace />;
}

