"use client";

import { type FormEvent, useId, useState } from "react";
import { InvalidRecordError } from "@/domain/records/typed";
import { useHouseholdSync } from "@/features/sync/sync-provider";
import { useOwnProfile, useRecordWriter } from "@/features/sync/typed-records";

/**
 * "What should the household call you?" (#132, ADR-0054). The server knows members only by
 * id, so the name lives in an encrypted `member` record that each member writes for
 * themselves. Asks until a name is set; afterwards it is a one-line "Change" control.
 */
export function MemberName() {
  const sync = useHouseholdSync();
  const own = useOwnProfile();
  const { save } = useRecordWriter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  if (!sync) return null;
  const current = own?.result.status === "ok" ? own.result.value : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sync) return;
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    setError("");
    try {
      await save(
        "member",
        { ...current, memberId: sync.userId, name: name.trim() },
        own?.id,
      );
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof InvalidRecordError
          ? "Enter a name of up to 40 characters."
          : "Couldn't save. Try again.",
      );
    }
  }

  if (current && !editing)
    return (
      <p className="text-sm">
        You appear as <strong>{current.name}</strong>{" "}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="underline"
        >
          Change
        </button>
      </p>
    );

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        What should your household call you?
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          name="name"
          defaultValue={current?.name}
          maxLength={40}
          required
          autoComplete="given-name"
          className="flex-1 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-1 font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Save
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Encrypted: only your household sees it.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
