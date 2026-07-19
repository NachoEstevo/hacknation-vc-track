import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ScanSearch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/pencil";
import { DEMO_OPPORTUNITIES, getOpportunity } from "@/lib/demo";
import { EvidenceWorkspace } from "./evidence-workspace";
import styles from "../diligence.module.css";

interface EvidencePageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return DEMO_OPPORTUNITIES.map((opportunity) => ({ id: opportunity.id }));
}

export async function generateMetadata({ params }: EvidencePageProps): Promise<Metadata> {
  const { id } = await params;
  const opportunity = getOpportunity(id);
  return { title: opportunity ? `${opportunity.project.name} evidence` : "Evidence not found" };
}

export default async function EvidencePage({ params }: EvidencePageProps) {
  const { id } = await params;
  const opportunity = getOpportunity(id);
  if (!opportunity) notFound();

  const projectHref = `/investor/projects/${opportunity.id}` as Route;
  const memoHref = `/investor/projects/${opportunity.id}/memo` as Route;

  return (
    <AppShell
      eyebrow={`${opportunity.project.name} · provenance`}
      title="Claim inspector"
      actions={(
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <ButtonLink href={projectHref} variant="secondary" leadingIcon={<ArrowLeft aria-hidden="true" />}>
            Back to project
          </ButtonLink>
          <ButtonLink href={memoHref} variant="ghost" leadingIcon={<FileText aria-hidden="true" />}>
            Open memo
          </ButtonLink>
        </div>
      )}
    >
      <div className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/investor/search">Discover</Link>
          <span>/</span>
          <Link href={projectHref}>{opportunity.project.name}</Link>
          <span>/</span>
          <span aria-current="page">Evidence</span>
        </nav>

        <div className={styles.demoNotice} role="note">
          <ScanSearch aria-hidden="true" />
          <span>
            Every item below belongs to a <strong>synthetic_demo</strong> fixture. Trust is a transparent
            provenance heuristic for the captured claim—not an investment score or statement of truth. Each
            claim keeps its own verification state; there is never a single score for the whole company.
          </span>
        </div>

        <EvidenceWorkspace opportunity={opportunity} />
      </div>
    </AppShell>
  );
}
