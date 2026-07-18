"use client";

import type { Route } from "next";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

export function MemoActions({ projectId }: { projectId: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
      <ButtonLink
        href={`/investor/projects/${projectId}` as Route}
        variant="ghost"
        size="sm"
        leadingIcon={<ArrowLeft />}
      >
        Project brief
      </ButtonLink>
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<Printer />}
        onClick={() => window.print()}
      >
        Print memo
      </Button>
    </div>
  );
}

