"use client";

import Link from "next/link";
import { type ReactNode, useId, useState } from "react";
import { NetWorthHero, useNetWorth } from "./net-worth";
import { SyncIndicator } from "./sync-status";

/**
 * Home after sign-in (UX.md §3.2, ADR-0059): the sync indicator, then the net-worth hero with
 * its lens toggle, or the first-run zero-state until the household adds anything. It fits one
 * screen (#34): no sparkline, composition or goals until M5. The household panel is behind a
 * secondary "Invite a member" action, so inviting reads as optional. The panel and the add
 * flow are passed in, so Home knows nothing about keys or invites.
 */
export function Home({
  household,
  add,
  addMore,
}: {
  household: ReactNode;
  /** The first-run "Add anything" trigger (#135); without it the CTA reads "Coming soon". */
  add?: ReactNode;
  /** The trigger under the hero once something exists. */
  addMore?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const summary = useNetWorth();
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
      <SyncIndicator />
      {summary.empty ? (
        <ZeroState add={add} />
      ) : (
        <>
          <NetWorthHero summary={summary} />
          {addMore}
        </>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="text-sm underline"
      >
        Invite a member
      </button>
      {open && (
        <div id={panelId} className="w-full text-left">
          {household}
        </div>
      )}
      <nav className="flex gap-4 text-sm">
        <Link href="/accounts" className="underline">
          Accounts
        </Link>
        <Link href="/settings" className="underline">
          Settings
        </Link>
      </nav>
    </div>
  );
}

/** First run (UX.md §3.2 empty): an explicit CTA, not just the add button elsewhere. */
function ZeroState({ add }: { add?: ReactNode }) {
  return (
    <section
      aria-label="Net worth"
      className="flex w-full flex-col items-center gap-3 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800"
    >
      <p className="text-base font-medium">
        Your household net worth will show up here
      </p>
      {add ?? (
        <>
          <button
            type="button"
            disabled
            className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white opacity-50 dark:bg-white dark:text-neutral-900"
          >
            Add your first account
          </button>
          <p className="text-xs text-neutral-500">Coming soon.</p>
        </>
      )}
    </section>
  );
}
