import { AppGate } from "@/features/auth/app-gate";
import { BuildBadge } from "@/features/version/build-badge";

export default function Home() {
  return (
    <AppGate>
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">NetWorth</h1>
        <p className="text-sm text-neutral-500">
          Unlocked. Your household arrives with the next milestones.
        </p>
        <BuildBadge />
      </main>
    </AppGate>
  );
}
