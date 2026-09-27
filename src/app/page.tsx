import { AppGate } from "@/features/auth/app-gate";
import { HouseholdPanel } from "@/features/household/household-panel";
import { BuildBadge } from "@/features/version/build-badge";

export default function Home() {
  return (
    <AppGate>
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">NetWorth</h1>
        <HouseholdPanel />
        <BuildBadge />
      </main>
    </AppGate>
  );
}
