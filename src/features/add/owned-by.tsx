"use client";

import { useId, useState } from "react";
import { FULL_BPS } from "@/domain/records/common";
import { bpsToPercent, parsePercent } from "./kinds";

export interface Person {
  memberId: string;
  name: string;
}

export interface Share {
  memberId: string;
  /** What was typed, so "33." isn't rewritten mid-edit; `bps` is null while it isn't a percent. */
  input: string;
  bps: number | null;
}

/** Equal shares in basis points; the odd ones go to the first in the list. */
export function evenShares(ids: readonly string[]): Share[] {
  const base = Math.floor(FULL_BPS / ids.length);
  return ids.map((memberId, i) => {
    const bps = base + (i < FULL_BPS - base * ids.length ? 1 : 0);
    return { memberId, input: bpsToPercent(bps), bps };
  });
}

/** Basis points still to assign; negative when over 100%, null while an input is unreadable. */
export function remainder(shares: readonly Share[]): number | null {
  let total = 0;
  for (const s of shares) {
    if (s.bps === null || s.bps === 0) return null;
    total += s.bps;
  }
  return FULL_BPS - total;
}

/**
 * "Owned by" (UX.md §4.2, §2.1): "Just me" until tapped, then a share per member with a live
 * remainder chip. The form saves only when the chip reads 0% left.
 */
export function OwnedBy({
  me,
  people,
  shares,
  onChange,
}: {
  me: string;
  people: readonly Person[];
  shares: readonly Share[];
  onChange: (next: Share[]) => void;
}) {
  const [open, setOpen] = useState(shares.length > 1);
  const id = useId();
  const nameOf = (memberId: string) =>
    memberId === me
      ? "Me"
      : (people.find((p) => p.memberId === memberId)?.name ?? "Former member");
  const left = remainder(shares);
  const summary =
    shares.length === 1 && shares[0]?.memberId === me
      ? "Just me"
      : shares.map((s) => `${nameOf(s.memberId)} ${s.input}%`).join(" · ");

  if (!open)
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          Owned by <strong>{summary}</strong>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="underline"
        >
          Change
        </button>
      </div>
    );

  const everyone = [
    me,
    ...people.map((p) => p.memberId).filter((m) => m !== me),
  ];
  const toggle = (memberId: string, on: boolean) => {
    const ids = on
      ? everyone.filter(
          (m) => m === memberId || shares.some((s) => s.memberId === m),
        )
      : shares.map((s) => s.memberId).filter((m) => m !== memberId);
    if (ids.length > 0) onChange(evenShares(ids));
  };
  const setShare = (memberId: string, input: string) =>
    onChange(
      shares.map((s) =>
        s.memberId === memberId
          ? { memberId, input, bps: parsePercent(input) }
          : s,
      ),
    );

  return (
    <fieldset className="flex flex-col gap-2 text-sm" aria-describedby={id}>
      <legend className="font-medium">Owned by</legend>
      {everyone.map((memberId) => {
        const share = shares.find((s) => s.memberId === memberId);
        return (
          <div key={memberId} className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2">
              <input
                type="checkbox"
                checked={!!share}
                onChange={(e) => toggle(memberId, e.target.checked)}
              />
              {nameOf(memberId)}
            </label>
            {share && shares.length > 1 && (
              <label className="flex items-center gap-1">
                <input
                  aria-label={
                    memberId === me
                      ? "Your share"
                      : `${nameOf(memberId)}'s share`
                  }
                  inputMode="decimal"
                  value={share.input}
                  onChange={(e) => setShare(memberId, e.target.value)}
                  className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-right dark:border-neutral-700"
                />
                %
              </label>
            )}
          </div>
        );
      })}
      {people.every((p) => p.memberId === me) && (
        <p className="text-xs text-neutral-500">
          Invite a member to share ownership with them.
        </p>
      )}
      <ShareChip id={id} left={left} unread="Enter a share for each owner" />
    </fieldset>
  );
}

/** The live remainder chip under a split; `unread` is shown while a share is unreadable. */
export function ShareChip({
  id,
  left,
  unread,
}: {
  id: string;
  left: number | null;
  unread: string;
}) {
  return (
    <p
      id={id}
      aria-live="polite"
      className={`self-start rounded-full px-2 py-0.5 text-xs ${
        left === 0
          ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          : "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
      }`}
    >
      {left === null
        ? unread
        : left === 0
          ? "Shares add up to 100%"
          : left > 0
            ? `${bpsToPercent(left)}% left to assign`
            : `Over by ${bpsToPercent(-left)}%`}
    </p>
  );
}
