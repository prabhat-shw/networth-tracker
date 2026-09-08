import { BuildBadge } from "@/features/version/build-badge";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">NetWorth</h1>
      <p className="text-sm text-neutral-500">
        Zero-knowledge household net-worth tracker. Foundation in place — see
        docs/STATE.md.
      </p>
      <BuildBadge />
    </main>
  );
}
