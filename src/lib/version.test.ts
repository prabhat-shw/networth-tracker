import { describe, expect, it } from "vitest";
import { type BuildInfo, buildLabel, isStaleBuild } from "./version";

const build = (sha: string, version = "0.1.0"): BuildInfo => ({
  version,
  sha,
  builtAt: "2026-09-08T00:00:00.000Z",
});

describe("isStaleBuild", () => {
  it("flags a different SHA as stale", () => {
    expect(isStaleBuild(build("aaaaaaa"), build("bbbbbbb"))).toBe(true);
  });

  it("does not flag the same build", () => {
    expect(isStaleBuild(build("aaaaaaa"), build("aaaaaaa"))).toBe(false);
  });

  it("detects a hotfix that reused the version number", () => {
    expect(
      isStaleBuild(build("aaaaaaa", "0.1.0"), build("bbbbbbb", "0.1.0")),
    ).toBe(true);
  });

  it("stays quiet when either side has no SHA (dev builds)", () => {
    expect(isStaleBuild(build("unknown"), build("bbbbbbb"))).toBe(false);
    expect(isStaleBuild(build("aaaaaaa"), build("unknown"))).toBe(false);
  });
});

describe("buildLabel", () => {
  it("reads as a version and a build", () => {
    expect(buildLabel(build("a1b2c3d"))).toBe("v0.1.0 · a1b2c3d");
  });
});
