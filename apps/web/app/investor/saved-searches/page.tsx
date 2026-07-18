import type { Metadata } from "next";
import { SavedSearchesWorkspace } from "./saved-searches-workspace";

export const metadata: Metadata = {
  title: "Saved searches",
  description: "Reopen transparent sourcing queries saved in this demo workspace.",
};

export default function SavedSearchesPage() {
  return <SavedSearchesWorkspace />;
}
