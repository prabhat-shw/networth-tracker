import RecordProbe from "nwt-e2e-probe";
import { AppGate } from "@/features/auth/app-gate";
import { HouseholdPanel } from "@/features/household/household-panel";
import { BuildBadge } from "@/features/version/build-badge";

export default function Home() {
  return (
    <AppGate>
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">NetWorth</h1>
        <HouseholdPanel />
        {/* A stub (renders nothing) except in NEXT_PUBLIC_E2E=1 builds; ADR-0036. */}
        <RecordProbe />
        <BuildBadge />
      </main>
    </AppGate>
  );
}
