import type { Metadata } from "next";
import { DEMO_OPPORTUNITIES } from "@/lib/demo";
import { SettingsWorkspace } from "./settings-workspace";

export const metadata: Metadata = {
  title: "Workspace settings",
  description: "Demo mode, privacy boundaries, and local workspace controls.",
};

export default function SettingsPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  const hasPublicSupabaseConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return (
    <SettingsWorkspace
      demoMode={demoMode}
      hasPublicSupabaseConfig={hasPublicSupabaseConfig}
      syntheticOpportunityCount={DEMO_OPPORTUNITIES.length}
    />
  );
}
