import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Create your founder profile",
  description: "Tell us about your project. We structure the first draft; you confirm it.",
};

export default async function FounderOnboardingPage() {
  const supabase = await createClient();
  if (!supabase) {
    redirect("/onboarding/role");
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/onboarding/role");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Brand href="/" />
        <p className={styles.stepNote}>Create your profile · about 3 minutes</p>
        <Link href="/" className={styles.skip}>
          Save &amp; exit
        </Link>
      </header>

      <OnboardingForm defaultName={data.user.user_metadata?.full_name ?? ""} />
    </main>
  );
}
