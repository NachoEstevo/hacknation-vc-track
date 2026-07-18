import type { Metadata } from "next";
import { ThesisWorkspace } from "./thesis-workspace";

export const metadata: Metadata = {
  title: "Investment thesis",
  description: "A legible, editable sourcing lens for the investor workspace.",
};

export default function ThesisPage() {
  return <ThesisWorkspace />;
}
