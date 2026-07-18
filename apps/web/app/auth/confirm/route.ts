import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";

const DEFAULT_REDIRECT_PATH = "/investor";
const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function getSafeRedirectUrl(request: NextRequest): URL {
  const fallback = new URL(DEFAULT_REDIRECT_PATH, request.nextUrl.origin);
  const requestedPath = request.nextUrl.searchParams.get("next");

  if (!requestedPath?.startsWith("/") || requestedPath.startsWith("//")) {
    return fallback;
  }

  try {
    const redirectUrl = new URL(requestedPath, request.nextUrl.origin);
    return redirectUrl.origin === request.nextUrl.origin ? redirectUrl : fallback;
  } catch {
    return fallback;
  }
}

function redirectWithoutCaching(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: NextRequest) {
  const redirectUrl = getSafeRedirectUrl(request);
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = request.nextUrl.searchParams.get("type");
  const supabase = await createClient();

  // The demo remains navigable without a configured Supabase project.
  if (!supabase) {
    return redirectWithoutCaching(redirectUrl);
  }

  if (tokenHash && otpType && EMAIL_OTP_TYPES.has(otpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (!error) {
      return redirectWithoutCaching(redirectUrl);
    }
  }

  const errorUrl = new URL("/", request.nextUrl.origin);
  errorUrl.searchParams.set("auth_error", "invalid_or_expired_link");
  return redirectWithoutCaching(errorUrl);
}
