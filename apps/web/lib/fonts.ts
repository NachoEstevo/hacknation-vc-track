import { Manrope, Newsreader } from "next/font/google";

export const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const displayFont = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
