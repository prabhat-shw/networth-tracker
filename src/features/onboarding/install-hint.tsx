"use client";

import { useEffect, useState } from "react";

/** What the hint needs to know about this browser; injectable for tests. */
export interface StorageEnv {
  /** Safari on iPhone/iPad, outside a Home Screen app. */
  iosBrowserTab(): boolean;
  /** Whether the browser granted persistent storage (`navigator.storage.persisted`). */
  persisted(): Promise<boolean>;
}

export const browserEnv: StorageEnv = {
  iosBrowserTab() {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ios =
      /iPad|iPhone|iPod/.test(nav.userAgent) ||
      (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
    return ios && nav.standalone !== true;
  },
  async persisted() {
    try {
      return (await navigator.storage?.persisted?.()) ?? false;
    } catch {
      return false;
    }
  },
};

export const INSTALL_HINT_KEY = "nwt.storageHint";

type Hint = "ios" | "not-persisted" | null;

const COPY: Record<Exclude<Hint, null>, string> = {
  ios: "Add NetWorth to your Home Screen (Share → Add to Home Screen). Safari deletes a site's data after 7 days without a visit, and your key is kept on this device.",
  "not-persisted":
    "This browser may clear NetWorth's data when space runs low. Add a way back in (passkey, passphrase or recovery kit) so you can always sign in again.",
};

/**
 * Storage warning while the key lives only on this device (ADR-0037, UX.md §3.0 B): iOS
 * Safari evicts site data after 7 days unused, so it gets an "Add to Home Screen" hint;
 * elsewhere, a refused `navigator.storage.persist()` gets a one-line risk. Dismissable.
 */
export function InstallHint({ env = browserEnv }: { env?: StorageEnv }) {
  const [hint, setHint] = useState<Hint>(null);

  useEffect(() => {
    let live = true;
    try {
      if (localStorage.getItem(INSTALL_HINT_KEY) === "dismissed") return;
    } catch {
      // Storage off: show the hint each time; it's dismissable for the session.
    }
    if (env.iosBrowserTab()) setHint("ios");
    else env.persisted().then((ok) => live && !ok && setHint("not-persisted"));
    return () => {
      live = false;
    };
  }, [env]);

  if (!hint) return null;
  const dismiss = () => {
    setHint(null);
    try {
      localStorage.setItem(INSTALL_HINT_KEY, "dismissed");
    } catch {
      // Dismissed for this session only.
    }
  };
  return (
    <aside
      aria-label="Storage notice"
      className="flex w-full items-start justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-left text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <p>{COPY[hint]}</p>
      <button type="button" onClick={dismiss} className="shrink-0 underline">
        Got it
      </button>
    </aside>
  );
}
