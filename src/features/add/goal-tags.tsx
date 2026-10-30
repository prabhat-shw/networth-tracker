"use client";

const field =
  "rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700";

export interface Tag {
  goalId: string;
  /** Percent of the record's value as typed; read with `parsePercent` on save. */
  input: string;
}

/**
 * "Tag to goal (optional)" (UX §4.2): earmark a percent of this record for one or more goals.
 * The allocation editor with fixed amounts and auto-tag rules is M5. Hidden with no goals.
 */
export function GoalTags({
  goals,
  tags,
  onChange,
}: {
  goals: readonly { id: string; name: string }[];
  tags: readonly Tag[];
  onChange: (next: Tag[]) => void;
}) {
  if (goals.length === 0) return null;
  const nameOf = (id: string) => goals.find((g) => g.id === id)?.name;
  const unused = goals.filter((g) => !tags.some((t) => t.goalId === g.id));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-medium">Tag to goal (optional)</legend>
      {tags.map((t) => (
        <div key={t.goalId} className="flex items-center gap-2">
          <span className="flex-1">{nameOf(t.goalId)}</span>
          <input
            aria-label={`Share for ${nameOf(t.goalId)}`}
            inputMode="decimal"
            value={t.input}
            onChange={(e) =>
              onChange(
                tags.map((x) =>
                  x.goalId === t.goalId ? { ...x, input: e.target.value } : x,
                ),
              )
            }
            className={`${field} w-16 text-right`}
          />
          %
          <button
            type="button"
            aria-label={`Untag ${nameOf(t.goalId)}`}
            onClick={() => onChange(tags.filter((x) => x.goalId !== t.goalId))}
          >
            ✕
          </button>
        </div>
      ))}
      {unused.length > 0 && (
        <select
          aria-label="Tag to goal"
          value=""
          onChange={(e) =>
            e.target.value &&
            onChange([...tags, { goalId: e.target.value, input: "100" }])
          }
          className={field}
        >
          <option value="">+ Tag to a goal</option>
          {unused.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}
