"use client";

import Link from "next/link";
import { useState } from "react";
import { RISK_COPY, type Risk } from "./protection";

export const BANNER_DISMISSED_KEY = "nwt.protectionDismissed";

function dismissedFor(): string | null {
  try {
    return sessionStorage.getItem(BANNER_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Persistent protection banner (ADR-0037, ADR-0042): one line per risk until every gap is
 * closed. "Not now" hides it for this browser session only, and only for this exact set of
 * risks — a new gap brings it back.
 */
export function ProtectionBanner({ risks }: { risks: Risk[] }) {
  const id = risks.join(",");
  const [dismissed, setDismissed] = useState(dismissedFor);
  if (risks.length === 0 || dismissed === id) return null;
  const dismiss = () => {
    setDismissed(id);
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, id);
    } catch {
      // Storage off: hidden until this page reloads.
    }
  };
  return (
    <aside
      aria-label="Account protection"
      className="flex w-full items-start justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-left text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <ul className="space-y-1">
        {risks.map((r) => (
          <li key={r}>{RISK_COPY[r]}</li>
        ))}
      </ul>
      <span className="flex shrink-0 gap-3">
        <Link href="/settings" className="font-medium underline">
          Fix
        </Link>
        <button type="button" onClick={dismiss} className="underline">
          Not now
        </button>
      </span>
    </aside>
  );
}
