import { deterministicUuid } from "./deterministic-id";

/**
 * The six `synthetic_demo` opportunities in `lib/demo/fixtures/*` are
 * intentionally never written by end users (see `projects_insert_owned`,
 * which forces authenticated inserts to `data_label = 'real'`). Instead,
 * `scripts/seed-synthetic-demo-catalog.ts` mirrors them once, with the
 * service role key, into real `projects` / `founders` / `evidence` /
 * `claims` / `claim_evidence` rows so that pipeline items and memo
 * citations created by any signed-in investor have a genuine row to point
 * to, with real referential integrity — instead of a foreign key into a
 * fixture that only exists in this app's TypeScript bundle.
 *
 * These ids are computed the same way here and in the seed script, so the
 * app never has to look up "which real project mirrors demo opportunity X"
 * by a text search — it is always this exact deterministic id.
 */
const NAMESPACE = "undr:synthetic_demo";

export function syntheticProjectId(opportunityId: string): string {
  return deterministicUuid(`${NAMESPACE}:project`, opportunityId);
}

export function syntheticFounderId(founderId: string): string {
  return deterministicUuid(`${NAMESPACE}:founder`, founderId);
}

export function syntheticClaimId(opportunityId: string, claimKey: string): string {
  return deterministicUuid(`${NAMESPACE}:claim`, `${opportunityId}:${claimKey}`);
}

export function syntheticEvidenceId(opportunityId: string, evidenceKey: string): string {
  return deterministicUuid(`${NAMESPACE}:evidence`, `${opportunityId}:${evidenceKey}`);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pipeline items, memos, and invitations all key off a `projectId` string
 * that is a real `projects.id` uuid when it came from a founder-created
 * project, and a demo fixture slug (e.g. `"quanta-forge"`) when it came from
 * the `synthetic_demo` catalog. This resolves either form to the real
 * `projects.id` row a database write can point to.
 */
export function resolveProjectDbId(projectId: string): string {
  return UUID_PATTERN.test(projectId) ? projectId : syntheticProjectId(projectId);
}
