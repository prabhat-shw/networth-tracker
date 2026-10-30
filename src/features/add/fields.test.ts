import { describe, expect, it } from "vitest";
import { assetData } from "@/domain/records/asset";
import { liabilityData } from "@/domain/records/liability";
import { KIND_BASE, KIND_FIELDS } from "./field-specs";
import {
  type FieldInputs,
  fieldInputs,
  paiseToInput,
  readFields,
} from "./fields";
import { KIND_OPTIONS } from "./kinds";

const ASHA = "0a000000-0000-4000-8000-0000000000a1";

/** A valid string for every required input type. */
const SAMPLE: Record<string, string> = {
  text: "USD",
  date: "2026-01-01",
  rupees: "100",
  percent: "7.1",
  units: "10.5",
  int: "12",
  grams: "12.5",
};

const common = {
  name: "Test",
  value: 0,
  owners: [{ memberId: ASHA, shareBps: 10_000 }],
  includeInNetWorth: true,
  tags: [],
  asOf: "2026-10-30",
  allocations: [],
};

function filled(kind: keyof typeof KIND_FIELDS): FieldInputs {
  const inputs = fieldInputs(KIND_FIELDS[kind]);
  for (const spec of KIND_FIELDS[kind]) {
    if (spec.input === "instrument") inputs["instrument.code"] = "ABC";
    else if (
      spec.input !== "switch" &&
      spec.input !== "select" &&
      !spec.optional
    )
      inputs[spec.key] = SAMPLE[spec.input] ?? "";
  }
  return inputs;
}

describe("KIND_FIELDS", () => {
  it("makes a valid record for every kind once its fields are filled in", () => {
    for (const o of KIND_OPTIONS) {
      const { data, unreadable } = readFields(
        KIND_FIELDS[o.kind],
        filled(o.kind),
      );
      expect(unreadable, o.kind).toEqual([]);
      const record = { ...common, ...KIND_BASE[o.kind], ...data, kind: o.kind };
      for (const k of Object.keys(record))
        if (record[k as keyof typeof record] === undefined)
          delete record[k as keyof typeof record];
      const schema = o.type === "asset" ? assetData : liabilityData;
      const parsed = schema.safeParse(record);
      expect(parsed.error?.issues, o.kind).toBeUndefined();
    }
  });

  it("round-trips a stored record through the form inputs", () => {
    const stored = {
      issuer: "corporate",
      payout: "monthly",
      taxSaver: true,
      autoRenew: false,
      interestBps: 710,
      maturityDate: "2030-04-01",
    };
    const specs = KIND_FIELDS.fixedDeposit;
    expect(readFields(specs, fieldInputs(specs, stored)).data).toEqual(stored);
  });

  it("keeps numeric select values and grams as integers", () => {
    const nps = readFields(
      KIND_FIELDS.nps,
      fieldInputs(KIND_FIELDS.nps, { tier: 2 }),
    );
    expect(nps.data.tier).toBe(2);
    const gold = readFields(KIND_FIELDS.preciousMetal, {
      ...fieldInputs(KIND_FIELDS.preciousMetal),
      weightMg: "10.25",
    });
    expect(gold.data.weightMg).toBe(10_250);
  });

  it("clears a blank optional field and flags an unreadable one", () => {
    const r = readFields(KIND_FIELDS.loan, {
      ...fieldInputs(KIND_FIELDS.loan),
      emi: "",
      tenureMonthsLeft: "twelve",
    });
    expect(r.data.emi).toBeUndefined();
    expect(r.unreadable).toEqual(["Months left"]);
  });
});

describe("paiseToInput", () => {
  it("writes paise back as a typeable amount", () => {
    expect(paiseToInput(1_500_050)).toBe("15000.5");
    expect(paiseToInput(1_500_005)).toBe("15000.05");
    expect(paiseToInput(50_000)).toBe("500");
  });
});
