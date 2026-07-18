import type { Metadata } from "next";
import { PipelineWorkspace } from "./pipeline-workspace";

export const metadata: Metadata = {
  title: "Pipeline",
  description: "A private, evidence-linked review pipeline for the investor workspace.",
};

export default function PipelinePage() {
  return <PipelineWorkspace />;
}
