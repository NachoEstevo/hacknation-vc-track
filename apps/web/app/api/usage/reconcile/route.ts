import { NextResponse, type NextRequest } from "next/server";
import { resolveUsageOwnerId } from "@/lib/usage/usage-identity.server";
import { reserveUsage, usageStatusFor } from "@/lib/usage/usage-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Charges candidate cards the moment they land on the board. The cookie
 * ledger cannot be written from inside a streaming response, so the client
 * calls this as each card appears; keys are `card:<chatId>:<slug>` — the
 * exact keys the chat route replays on the next turn — so reconciling twice
 * (or racing that replay) never double-charges.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { chatId?: unknown; slugs?: unknown } | null;
  const chatId = typeof body?.chatId === "string" && body.chatId.trim()
    ? body.chatId.trim().slice(0, 120)
    : null;
  const slugs = Array.isArray(body?.slugs)
    ? body.slugs
        .filter((slug): slug is string => typeof slug === "string" && SLUG_PATTERN.test(slug) && slug.length <= 80)
        .slice(0, 12)
    : [];
  if (!chatId || slugs.length === 0) {
    return NextResponse.json({ message: "chatId and slugs are required." }, { status: 400 });
  }

  const ownerId = await resolveUsageOwnerId();
  for (const slug of slugs) {
    await reserveUsage({ ownerId, kind: "prospect_search", idempotencyKey: `card:${chatId}:${slug}` });
  }
  const status = await usageStatusFor(ownerId, chatId);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
