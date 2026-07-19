import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AnonymousSession } from "@/components/anonymous-session";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { bodyFont, displayFont, monoFont } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "undr — Evidence-first venture sourcing",
    template: "%s · undr",
  },
  description:
    "Find and understand early founders and projects before they reach traditional venture channels.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <AnonymousSession />
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
