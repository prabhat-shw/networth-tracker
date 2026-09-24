type Env = Record<string, string | undefined>;

/** True when this build is the untrusted Vercel staging target (ADR-0006). */
export function isStaging(env: Env): boolean {
  return env.VERCEL === "1";
}

export function isDemoMode(env: Env): boolean {
  return env.DEMO_MODE === "true";
}

/**
 * Staging must never look like somewhere real data can live. Called from next.config.ts,
 * so a Vercel build without `DEMO_MODE=true` fails and nothing is deployed.
 */
export function assertDeploySafe(env: Env): void {
  if (isStaging(env) && !isDemoMode(env)) {
    throw new Error(
      "Refusing to build: this is Vercel staging and DEMO_MODE is not 'true'. " +
        "Set DEMO_MODE=true in the Vercel project env (ADR-0006).",
    );
  }
}
