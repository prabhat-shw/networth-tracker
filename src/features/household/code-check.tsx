"use client";

import type { Invitee, OpenInvite } from "./panel-client";

/** The code check (§3.0 C). Holds the invitee as shown, never a key. */
export type Check =
  | { at: "comparing"; invite: OpenInvite; invitee: Invitee; theirs: string }
  | { at: "adding" }
  | { at: "stopped" };

/** The inviter's code check (UX.md §3.0 C, ADR-0031); nothing is wrapped before *It matches*. */
export function CodeCheck({
  check,
  ownCode,
  onMatch,
  onMismatch,
  onClose,
}: {
  check: Check;
  ownCode: string | null;
  onMatch(): void;
  onMismatch(): void;
  onClose(): void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Check their code"
      className="flex flex-col gap-3 rounded-lg border border-neutral-300 p-4 dark:border-neutral-700"
    >
      {check.at === "stopped" ? (
        <>
          <p role="alert" className="font-medium text-red-600">
            Stop. Someone may be intercepting this invite. Don't retry; tell the
            person who runs your server.
          </p>
          <p>The invite is cancelled and nothing was shared.</p>
          <button type="button" onClick={onClose} className={secondary}>
            Close
          </button>
        </>
      ) : check.at === "adding" ? (
        <p>Adding…</p>
      ) : (
        <>
          <Code label={`${check.invitee.email}'s code`} value={check.theirs} />
          <Code label="Your code" value={ownCode} />
          <p>
            Ask {check.invitee.email} to read theirs. Does it match exactly?
          </p>
          <button type="button" onClick={onMatch} className={primary}>
            It matches — add {check.invitee.email}
          </button>
          <button type="button" onClick={onMismatch} className={secondary}>
            It doesn't match
          </button>
          <button type="button" onClick={onClose} className="py-1 text-xs">
            Not now
          </button>
        </>
      )}
    </div>
  );
}

function Code({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="font-mono text-xl tracking-wider">{value ?? "…"}</p>
    </div>
  );
}

const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white dark:bg-white dark:text-neutral-900";
const secondary =
  "rounded-md border border-neutral-300 px-3 py-2 font-medium dark:border-neutral-700";
