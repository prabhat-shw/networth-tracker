/**
 * Build identity. Baked in at build time (see next.config.ts) so the running app can say
 * exactly which build it is, and notice when the server is serving a newer one.
 */

export type BuildInfo = {
  /** Semver from package.json, e.g. "0.1.0". */
  version: string;
  /** Short git SHA of the commit this bundle was built from. */
  sha: string;
  /** ISO timestamp of the build. */
  builtAt: string;
};

export const BUILD: BuildInfo = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
  sha: process.env.NEXT_PUBLIC_GIT_SHA ?? "unknown",
  builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? "",
};

/**
 * True when the server is serving a different build from the one running in this tab.
 * Compared on SHA, not version: a hotfix can ship without a semver bump, and the SHA is
 * the only thing that identifies a build uniquely.
 */
export function isStaleBuild(running: BuildInfo, served: BuildInfo): boolean {
  if (served.sha === "unknown" || running.sha === "unknown") return false;
  return served.sha !== running.sha;
}

/** Short human label, e.g. "v0.1.0 · a1b2c3d". */
export function buildLabel(build: BuildInfo = BUILD): string {
  return `v${build.version} · ${build.sha}`;
}
