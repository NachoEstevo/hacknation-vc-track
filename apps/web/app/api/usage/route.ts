import { NextResponse, type NextRequest } from "next/server";
import { resolveUsageOwnerId } from "@/lib/usage/usage-identity.server";
import { usageStatusFor } from "@/lib/usage/usage-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current free-tier counters for this identity — feeds the sidebar meter. */
export async function GET(request: NextRequest) {
  const ownerId = await resolveUsageOwnerId();
  const chatId = request.nextUrl.searchParams.get("chatId")?.trim().slice(0, 120) || undefined;
  const status = await usageStatusFor(ownerId, chatId);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
