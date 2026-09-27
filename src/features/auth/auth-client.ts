/**
 * Browser side of Better Auth (ADR-0020), narrowed to what the sign-in screen needs and
 * mapped to the handful of outcomes the UI distinguishes (UX.md §3.0 A). The server
 * answers "code sent" identically for every address, so there is no outcome for "unknown".
 */
import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), passkeyClient()],
  // Looks `fetch` up per call rather than capturing it at startup, so the global that
  // browser tests intercept is the one every auth request goes through.
  fetchOptions: { customFetchImpl: (input, init) => fetch(input, init) },
});

export type SignInError =
  | { kind: "wrong-code" }
  | { kind: "stale-code" } // expired, or too many wrong tries: a new code is needed
  | { kind: "rate-limited"; retryAfterS: number }
  | { kind: "failed" };

export type SignInResult = { ok: true } | { ok: false; error: SignInError };

export interface SignInApi {
  sendCode(email: string): Promise<SignInResult>;
  verifyCode(email: string, code: string): Promise<SignInResult>;
  signInWithPasskey(): Promise<SignInResult>;
}

type BetterAuthError = { status: number; code?: string } | null;

const RATE_LIMIT_FALLBACK_S = 300;

function toResult(
  error: BetterAuthError,
  retryAfter?: string | null,
): SignInResult {
  if (!error) return { ok: true };
  if (error.status === 429) {
    const s = Number(retryAfter);
    return {
      ok: false,
      error: {
        kind: "rate-limited",
        retryAfterS: Number.isFinite(s) && s > 0 ? s : RATE_LIMIT_FALLBACK_S,
      },
    };
  }
  if (error.code === "INVALID_OTP")
    return { ok: false, error: { kind: "wrong-code" } };
  if (error.code === "OTP_EXPIRED" || error.code === "TOO_MANY_ATTEMPTS")
    return { ok: false, error: { kind: "stale-code" } };
  return { ok: false, error: { kind: "failed" } };
}

/** Runs a Better Auth call, keeping the `X-Retry-After` header a 429 carries. */
async function call(
  run: (onResponse: (ctx: { response: Response }) => void) => Promise<{
    error: BetterAuthError;
  }>,
): Promise<SignInResult> {
  let retryAfter: string | null = null;
  try {
    const { error } = await run(({ response }) => {
      retryAfter = response.headers.get("x-retry-after");
    });
    return toResult(error, retryAfter);
  } catch {
    return { ok: false, error: { kind: "failed" } };
  }
}

export function betterAuthSignIn(client = authClient): SignInApi {
  return {
    sendCode: (email) =>
      call((onResponse) =>
        client.emailOtp.sendVerificationOtp(
          { email, type: "sign-in" },
          { onResponse },
        ),
      ),
    verifyCode: (email, otp) =>
      call((onResponse) =>
        client.signIn.emailOtp({ email, otp }, { onResponse }),
      ),
    signInWithPasskey: () =>
      call((onResponse) =>
        client.signIn.passkey({ fetchOptions: { onResponse } }),
      ),
  };
}

/**
 * Whether this browser registered a passkey here (set by first run, #53). Not a secret:
 * it only decides whether the passkey button is offered. Storage may be unavailable.
 */
export const PASSKEY_HINT_KEY = "nwt.passkey";

export function hasPasskeyHint(): boolean {
  try {
    return (
      typeof PublicKeyCredential !== "undefined" &&
      localStorage.getItem(PASSKEY_HINT_KEY) === "1"
    );
  } catch {
    return false;
  }
}
