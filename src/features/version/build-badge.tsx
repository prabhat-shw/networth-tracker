import { BUILD, buildLabel } from "@/lib/version";

/** Unobtrusive build stamp — the answer to "is the deploy live yet?". */
export function BuildBadge({ className = "" }: { className?: string }) {
  const builtAt = BUILD.builtAt ? new Date(BUILD.builtAt) : null;
  return (
    <span
      className={`font-mono text-xs text-neutral-500 ${className}`}
      title={
        builtAt
          ? `Built ${builtAt.toLocaleString("en-IN")}`
          : "Development build"
      }
    >
      {buildLabel()}
    </span>
  );
}
