import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import {
  assertDeploySafe,
  isDemoMode,
  isStaging,
} from "./src/lib/deploy-guard";

// Fails the Vercel build unless DEMO_MODE=true (ADR-0006).
assertDeploySafe(process.env);

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

/**
 * Build identity is baked in here so a running tab can prove which build it is.
 * In Docker the repo's .git is not present, so the SHA arrives as a build arg.
 */
function resolveGitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // Required by the Docker runner stage (ADR-0006). Not on Vercel: Next 16.3 standalone
  // skips next-server.js.nft.json, which Vercel's builder needs (vercel/next.js#96646).
  output: isStaging(process.env) ? undefined : "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: resolveGitSha(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_DEMO_MODE: String(isDemoMode(process.env)),
  },
};

export default nextConfig;
