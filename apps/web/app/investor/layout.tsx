import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Investor workspace",
    template: "%s · undr",
  },
};

export default function InvestorLayout({ children }: { children: ReactNode }) {
  return children;
}
