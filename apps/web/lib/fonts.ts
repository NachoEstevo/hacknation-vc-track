import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";

export const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const displayFont = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
