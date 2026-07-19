import type { Metadata } from "next";
import { RadarWorkspace } from "./radar-workspace";

export const metadata: Metadata = {
  title: "Radar",
  description: "People you pinned from research, kept with their evidence and fit context.",
};

export default function RadarPage() {
  return <RadarWorkspace />;
}
