import { describe, expect, it } from "vitest";
import { UNIVERSE_KINDS } from "@/domain/prices/universe";
import type { Db } from "./guard";
import {
  cronAuthorized,
  cronIngest,
  ingestAll,
  nextRun,
  runDate,
  startPriceSchedule,
  type Timer,
} from "./price-schedule";

const at = (iso: string) => new Date(iso);

describe("runDate", () => {
  it("is today's IST date for the evening run", () => {
    expect(runDate(at("2026-10-30T18:00:00Z"))).toBe("2026-10-30"); // 23:30 IST
  });
  it("is the previous IST day for the morning retry", () => {
    expect(runDate(at("2026-10-31T01:30:00Z"))).toBe("2026-10-30"); // 07:00 IST
  });
  it("is the previous IST day for a cron that slipped past midnight IST", () => {
    expect(runDate(at("2026-10-30T18:45:00Z"))).toBe("2026-10-30"); // 00:15 IST, 31st
  });
});

describe("nextRun", () => {
  it("picks 23:30 IST later the same day", () => {
    expect(nextRun(at("2026-10-30T10:00:00Z"))).toEqual(
      at("2026-10-30T18:00:00Z"),
    );
  });
  it("picks 07:00 IST the next morning after the evening run", () => {
    expect(nextRun(at("2026-10-30T18:00:00Z"))).toEqual(
      at("2026-10-31T01:30:00Z"),
    );
  });
  it("picks 07:00 IST the same morning just after IST midnight", () => {
    expect(nextRun(at("2026-10-30T18:31:00Z"))).toEqual(
      at("2026-10-31T01:30:00Z"),
    );
  });
});

describe("startPriceSchedule", () => {
  it("runs each slot with its run date, survives a throw, and stops", async () => {
    let clock = at("2026-10-30T10:00:00Z");
    const pending: { fn: () => void; ms: number }[] = [];
    const timer: Timer = {
      set: (fn, ms) => pending.push({ fn, ms }),
      clear: () => {
        pending.length = 0;
      },
    };
    const dates: string[] = [];
    const logs: string[] = [];
    const tick = async () => {
      const { fn, ms } = pending.shift() as { fn: () => void; ms: number };
      clock = new Date(clock.getTime() + ms);
      fn();
      await new Promise((r) => setTimeout(r, 0));
    };
    const stop = startPriceSchedule(
      async (date) => {
        dates.push(date);
        if (dates.length === 1) throw new Error("boom");
      },
      { now: () => clock, timer, log: (l) => logs.push(l) },
    );
    expect(pending[0].ms).toBe(8 * 3_600_000);
    await tick();
    await tick();
    expect(dates).toEqual(["2026-10-30", "2026-10-30"]);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0])).toMatchObject({ status: "crashed" });
    expect(pending).toHaveLength(1);
    stop();
    expect(pending).toHaveLength(0);
  });
});

const failing = {
  db: {} as Db,
  fetchUniverse: async () => {
    throw new Error("feed down");
  },
};

describe("ingestAll", () => {
  it("tries every kind and logs one line each", async () => {
    const lines: string[] = [];
    const results = await ingestAll(failing, "2026-10-30", (l) =>
      lines.push(l),
    );
    expect(results.map((r) => r.kind)).toEqual([...UNIVERSE_KINDS]);
    expect(results.every((r) => r.status === "failed")).toBe(true);
    expect(lines.map((l) => JSON.parse(l).event)).toEqual(
      UNIVERSE_KINDS.map(() => "price-ingest"),
    );
  });
});

const req = (auth?: string) =>
  new Request("http://x/api/cron/prices", {
    headers: auth ? { authorization: auth } : {},
  });

describe("cron route", () => {
  it("needs the exact bearer secret, and a configured one", () => {
    expect(cronAuthorized(req("Bearer s3cret"), "s3cret")).toBe(true);
    expect(cronAuthorized(req("Bearer s3creT"), "s3cret")).toBe(false);
    expect(cronAuthorized(req(), "s3cret")).toBe(false);
    expect(cronAuthorized(req("Bearer "), undefined)).toBe(false);
    expect(cronAuthorized(req("Bearer "), "")).toBe(false);
  });

  it("answers 401 without running anything", async () => {
    let calls = 0;
    const res = await cronIngest(
      {
        ...failing,
        fetchUniverse: async () => {
          calls++;
          throw new Error("x");
        },
        secret: "s3cret",
      },
      req("Bearer wrong"),
    );
    expect(res.status).toBe(401);
    expect(calls).toBe(0);
  });

  it("ingests the run date and reports per kind", async () => {
    const res = await cronIngest(
      { ...failing, secret: "s3cret", now: () => at("2026-10-31T01:30:00Z") },
      req("Bearer s3cret"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-10-30");
    expect(body.results).toHaveLength(UNIVERSE_KINDS.length);
  });
});
