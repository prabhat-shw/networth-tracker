"use client";

import Link from "next/link";
import { type ReactNode, useId, useState } from "react";

/**
 * Home after sign-in (UX.md §3.2 empty state, #105). Until M2 adds records, it is the
 * zero-state only. The household panel is behind a secondary "Invite a member" action, so
 * inviting reads as optional, not as the next onboarding step. The panel is passed in, so
 * Home knows nothing about keys or invites.
 */
export function Home({ household }: { household: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
      <section
        aria-label="Net worth"
        className="flex w-full flex-col items-center gap-3 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800"
      >
        <p className="text-base font-medium">
          Your household net worth will show up here
        </p>
        <button
          type="button"
          disabled
          className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white opacity-50 dark:bg-white dark:text-neutral-900"
        >
          Add your first account
        </button>
        <p className="text-xs text-neutral-500">Coming soon.</p>
      </section>
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
      <Link href="/settings" className="text-sm underline">
        Settings
      </Link>
    </div>
  );
}
