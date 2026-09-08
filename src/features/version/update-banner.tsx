"use client";

import { useEffect, useState } from "react";
import { BUILD, type BuildInfo, isStaleBuild } from "@/lib/version";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Tells the user, honestly, when the server has a newer build than the tab they are
 * looking at. A PWA will happily serve yesterday's bundle from cache forever; this is how
 * the owner knows whether the fix they just deployed is actually the app in front of them.
 */
export function UpdateBanner() {
  const [served, setServed] = useState<BuildInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as BuildInfo;
        if (!cancelled) setServed(next);
      } catch {
        // Offline is normal for this app; try again on the next tick.
      }
    }

    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!served || !isStaleBuild(BUILD, served)) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-4 border-t border-black/10 bg-neutral-900 px-4 py-3 text-sm text-white dark:border-white/10"
    >
      <span>
        A newer version is available —{" "}
        <span className="font-mono">v{served.version}</span>
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-white px-3 py-1.5 font-medium text-neutral-900"
      >
        Reload
      </button>
    </div>
  );
}
