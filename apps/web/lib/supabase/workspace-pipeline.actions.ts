"use server";

import type { PipelineItem, PipelineStage, WorkspaceMutationResult } from "@/components/workspace-provider";
import { resolveProjectDbId } from "./synthetic-demo-catalog";
import { getAuthedContext } from "./workspace-context";

interface PipelineItemRow {
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  project: { slug: string | null } | { slug: string | null }[] | null;
}

function projectSlug(project: PipelineItemRow["project"]): string | null {
  if (!project) return null;
  return Array.isArray(project) ? project[0]?.slug ?? null : project.slug;
}

/** Reads the caller's pipeline, keyed by the same `projectId` string (demo slug or founder-project uuid) the UI already renders with. */
export async function loadPipelineItemsAction(): Promise<PipelineItem[]> {
  const ctx = await getAuthedContext();
  if (!ctx) return [];
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("pipeline_items")
    .select("status, notes, created_at, updated_at, project:projects(slug)")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return (data as PipelineItemRow[]).flatMap((row) => {
    const slug = projectSlug(row.project);
    if (!slug) return [];
    return [{
      projectId: slug,
      stage: row.status as PipelineStage,
      note: row.notes ?? undefined,
      addedAt: row.created_at,
      updatedAt: row.updated_at,
    }];
  });
}

export async function addPipelineItemAction(input: {
  projectId: string;
  stage?: PipelineStage;
  note?: string;
}): Promise<WorkspaceMutationResult> {
  const ctx = await getAuthedContext();
  if (!ctx) return "failed";
  const { supabase, userId } = ctx;

  const { error } = await supabase.from("pipeline_items").insert({
    owner_user_id: userId,
    project_id: resolveProjectDbId(input.projectId),
    status: input.stage ?? "discovered",
    notes: input.note?.trim() || null,
  });
  if (!error) return "saved";
  // unique (owner_user_id, project_id) violation means it is already in the pipeline.
  return error.code === "23505" ? "no_change" : "failed";
}

export async function removePipelineItemAction(projectId: string): Promise<WorkspaceMutationResult> {
  const ctx = await getAuthedContext();
  if (!ctx) return "failed";
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("pipeline_items")
    .delete()
    .eq("owner_user_id", userId)
    .eq("project_id", resolveProjectDbId(projectId))
    .select("id");
  if (error) return "failed";
  return (data?.length ?? 0) > 0 ? "saved" : "no_change";
}

export async function movePipelineItemAction(projectId: string, stage: PipelineStage): Promise<WorkspaceMutationResult> {
  const ctx = await getAuthedContext();
  if (!ctx) return "failed";
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("pipeline_items")
    .update({ status: stage })
    .eq("owner_user_id", userId)
    .eq("project_id", resolveProjectDbId(projectId))
    .neq("status", stage)
    .select("id");
  if (error) return "failed";
  return (data?.length ?? 0) > 0 ? "saved" : "no_change";
}

export async function updatePipelineNoteAction(projectId: string, note: string): Promise<WorkspaceMutationResult> {
  const ctx = await getAuthedContext();
  if (!ctx) return "failed";
  const { supabase, userId } = ctx;

  const { data, error } = await supabase
    .from("pipeline_items")
    .update({ notes: note.trim() || null })
    .eq("owner_user_id", userId)
    .eq("project_id", resolveProjectDbId(projectId))
    .select("id");
  if (error) return "failed";
  return (data?.length ?? 0) > 0 ? "saved" : "no_change";
}
