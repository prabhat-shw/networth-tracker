"use client";

import Link from "next/link";
import { useHouseholdSync, useSyncStatus } from "@/features/sync/sync-provider";
import type { SyncStatus } from "@/sync/household-sync";

/** "just now", "4 min ago", "2 h ago", "3 days ago": coarse on purpose. */
export function ago(then: Date, now: Date): string {
  const min = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

/**
 * The sync indicator (UX.md §2.3, ADR-0059). Synced is muted and hidden on mobile, where only
 * a state worth reporting shows. Offline is info, not alarm. Edits held back by the ADR-0040
 * `409` get a warning with the way out, since nothing else tells the member they are stuck.
 */
export function SyncIndicator({
  status: given,
  now = () => new Date(),
}: {
  status?: SyncStatus;
  now?: () => Date;
}) {
  const running = useHouseholdSync() !== null;
  const live = useSyncStatus();
  if (!given && !running) return null;
  const { state, lastSyncedAt } = given ?? live;
  const base = "w-full rounded-md px-3 py-1 text-left text-xs";
  switch (state) {
    case "syncing":
      return (
        <output className={`${base} block text-neutral-500`}>
          <span aria-hidden="true">⟳</span> Syncing…
        </output>
      );
    case "synced":
      return (
        <output className={`${base} hidden text-neutral-500 sm:block`}>
          <span aria-hidden="true">⏱</span> Synced
          {lastSyncedAt ? ` ${ago(lastSyncedAt, now())}` : ""}
        </output>
      );
    case "offline":
      return (
        <output
          className={`${base} block bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100`}
        >
          <span aria-hidden="true">⚡</span> You're offline: changes save on
          this device and sync later
        </output>
      );
    case "recovery":
      return (
        <p
          role="alert"
          className={`${base} flex justify-between gap-3 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100`}
        >
          <span>
            <span aria-hidden="true">⚠</span> Changes are waiting: add a
            recovery method so they can sync
          </span>
          <Link href="/settings" className="shrink-0 font-medium underline">
            Add one
          </Link>
        </p>
      );
  }
}
