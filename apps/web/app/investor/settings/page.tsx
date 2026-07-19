import type { Metadata } from "next";
import { SettingsWorkspace } from "./settings-workspace";

export const metadata: Metadata = {
  title: "Settings",
  description: "Edit your investor profile and the sourcing brief that grounds every search.",
};

export default function InvestorSettingsPage() {
  return <SettingsWorkspace />;
}
