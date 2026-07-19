import { invalidRequest } from "./errors.js";
import type { FounderEvidenceInput, SearchInput, WatchlistInput } from "./types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalidRequest("A JSON object is required.");
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) invalidRequest(`Unknown field: ${unknown[0]}.`);
}

export function uuid(value: string, field: string): string {
  if (!UUID.test(value)) invalidRequest(`${field} must be a UUID.`);
  return value;
}

export function searchInput(value: unknown): SearchInput {
  const body = record(value);
  onlyKeys(body, ["query", "limit"]);
  if (typeof body.query !== "string") invalidRequest("query is required.");
  const query = body.query.trim().replace(/\s+/gu, " ");
  if (query.length === 0 || query.length > 2_000) invalidRequest("query must contain between 1 and 2000 characters.");
  const limit = body.limit ?? 10;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50) invalidRequest("limit must be an integer between 1 and 50.");
  return { query, limit: limit as number };
}

export function watchlistInput(value: unknown): WatchlistInput {
  const body = record(value);
  onlyKeys(body, ["status", "note"]);
  const status = body.status ?? "watching";
  if (!(["watching", "contacted", "passed"] as unknown[]).includes(status)) invalidRequest("status is invalid.");
  const note = body.note ?? null;
  if (note !== null && (typeof note !== "string" || note.trim().length > 2_000)) invalidRequest("note must be at most 2000 characters.");
  return { status: status as WatchlistInput["status"], note: typeof note === "string" ? note.trim() || null : null };
}

function safeHttpUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2_048) invalidRequest("sourceUrl is invalid.");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") invalidRequest("sourceUrl must use HTTP or HTTPS.");
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return invalidRequest("sourceUrl is invalid.");
  }
}

export function founderEvidenceInput(value: unknown): FounderEvidenceInput {
  const body = record(value);
  onlyKeys(body, ["evidenceType", "sourceUrl", "excerpt", "structuredPayload", "visibility"]);
  if (typeof body.evidenceType !== "string" || !/^[a-z][a-z0-9_]{2,63}$/u.test(body.evidenceType)) {
    invalidRequest("evidenceType must be a snake_case identifier.");
  }
  const excerpt = body.excerpt === undefined || body.excerpt === null ? null : body.excerpt;
  if (excerpt !== null && (typeof excerpt !== "string" || excerpt.trim().length === 0 || excerpt.length > 5_000)) {
    invalidRequest("excerpt must contain at most 5000 characters.");
  }
  const structuredPayload = body.structuredPayload === undefined || body.structuredPayload === null
    ? null
    : record(body.structuredPayload);
  if (structuredPayload && JSON.stringify(structuredPayload).length > 25_000) invalidRequest("structuredPayload is too large.");
  const sourceUrl = safeHttpUrl(body.sourceUrl);
  if (!sourceUrl && !structuredPayload) invalidRequest("sourceUrl or structuredPayload is required.");
  const visibility = body.visibility ?? "founder_private";
  if (visibility !== "founder_private" && visibility !== "investor_private") invalidRequest("visibility is invalid.");
  return {
    evidenceType: body.evidenceType,
    sourceUrl,
    excerpt: typeof excerpt === "string" ? excerpt.trim() : null,
    structuredPayload,
    visibility,
  };
}
