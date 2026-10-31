"use client";

import { useState } from "react";

const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";
const secondary =
  "rounded-md border border-neutral-300 px-3 py-2 font-medium disabled:opacity-50 dark:border-neutral-700";

/**
 * Save, Save & add another (new records only), and Delete with its confirm step (edits only).
 * The submit buttons carry `value` so the form can tell which one was pressed.
 */
export function FormActions({
  canSave,
  busy,
  editing,
  onDelete,
}: {
  canSave: boolean;
  busy: boolean;
  editing: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        value="done"
        disabled={!canSave || busy}
        className={primary}
      >
        Save
      </button>
      {!editing && (
        <button
          type="submit"
          value="again"
          disabled={!canSave || busy}
          className={secondary}
        >
          Save &amp; add another
        </button>
      )}
      {editing &&
        (confirming ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className={`${secondary} text-red-600`}
          >
            Yes, delete for everyone
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${secondary} text-red-600`}
          >
            Delete
          </button>
        ))}
    </div>
  );
}
