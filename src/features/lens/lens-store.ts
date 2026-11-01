"use client";

/**
 * The ownership lens (UX.md §2.1), one per device (ADR-0071 §1). Home, Accounts, Goals and
 * the timeline read the same choice, so switching on one screen holds on the others. It is
 * memory only: never synced, never persisted, and back to Household on lock.
 */
import { create } from "zustand";
import type { Lens } from "@/domain/networth";
import { type KeySession, keySession } from "@/features/lock/key-session";

/** "household" or a member id. */
export type LensId = string;

interface LensState {
  lens: LensId;
  setLens: (lens: LensId) => void;
}

export const useLensStore = create<LensState>((set) => ({
  lens: "household",
  setLens: (lens) => set({ lens }),
}));

/** Back to Household whenever `session` locks; returns the unsubscribe. */
export function resetLensOnLock(
  session: Pick<KeySession, "state" | "subscribe">,
): () => void {
  return session.subscribe(() => {
    if (session.state().status === "locked")
      useLensStore.setState({ lens: "household" });
  });
}

resetLensOnLock(keySession);

/** The lens id as the domain's `Lens`. */
export function toLens(id: LensId): Lens {
  return id === "household" ? "household" : { memberId: id };
}
