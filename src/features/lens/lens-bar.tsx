"use client";

import { useMemo } from "react";
import { useHouseholdSync } from "@/features/sync/sync-provider";
import { useMembers } from "@/features/sync/typed-records";
import { type LensId, toLens, useLensStore } from "./lens-store";

export interface LensOption {
  id: LensId;
  label: string;
}

/**
 * Me · Household · each other member with a name, by name. A member who never set a name has
 * no lens yet (ADR-0059). The chosen lens falls back to Household when it isn't offered here
 * (a member who left), so a screen never shows a lens nobody can pick.
 */
export function useLens() {
  const me = useHouseholdSync()?.userId ?? "";
  const profiles = useMembers();
  const chosen = useLensStore((s) => s.lens);
  const setLens = useLensStore((s) => s.setLens);
  const others = useMemo(
    () =>
      [...profiles]
        .filter(([id]) => id !== me)
        .map(([id, p]) => ({ id, label: p.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [profiles, me],
  );
  const options: LensOption[] = [
    ...(me ? [{ id: me, label: "Me" }] : []),
    { id: "household", label: "Household" },
    ...others,
  ];
  const id = options.some((o) => o.id === chosen) ? chosen : "household";
  return { id, lens: toLens(id), me, options, setLens };
}

/** The lens toggle (UX.md §2.1). Switching only re-does arithmetic; nothing is fetched. */
export function LensBar() {
  const { id, options, setLens } = useLens();
  return (
    <fieldset
      aria-label="Whose net worth"
      className="m-0 flex border-0 max-w-full gap-1 self-center overflow-x-auto rounded-md bg-neutral-100 p-1 text-sm dark:bg-neutral-900"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={id === o.id}
          onClick={() => setLens(o.id)}
          className="shrink-0 rounded px-3 py-1 aria-pressed:bg-white aria-pressed:font-medium aria-pressed:shadow-sm dark:aria-pressed:bg-neutral-700"
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
