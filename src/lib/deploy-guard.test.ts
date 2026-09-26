import { describe, expect, it } from "vitest";
import { assertDeploySafe, isDemoMode } from "./deploy-guard";

describe("assertDeploySafe", () => {
  it("refuses a Vercel build without DEMO_MODE=true", () => {
    expect(() => assertDeploySafe({ VERCEL: "1" })).toThrow(/DEMO_MODE/);
    expect(() =>
      assertDeploySafe({ VERCEL: "1", DEMO_MODE: "false" }),
    ).toThrow();
    expect(() =>
      assertDeploySafe({ VERCEL: "1", DEMO_MODE: "TRUE" }),
    ).toThrow();
  });

  it("allows a Vercel build in demo mode", () => {
    expect(() =>
      assertDeploySafe({ VERCEL: "1", DEMO_MODE: "true" }),
    ).not.toThrow();
  });

  it("allows the home server, which never sets VERCEL", () => {
    expect(() => assertDeploySafe({ DEMO_MODE: "false" })).not.toThrow();
    expect(() => assertDeploySafe({})).not.toThrow();
  });
});

describe("isDemoMode", () => {
  it("accepts only the exact string 'true'", () => {
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });
});
