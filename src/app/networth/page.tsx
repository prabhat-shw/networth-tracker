import Link from "next/link";
import { AppGate } from "@/features/auth/app-gate";
import { Timeline } from "@/features/timeline/timeline";

export default function NetWorthPage() {
  return (
    <AppGate>
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 p-4 sm:p-8">
        <Link href="/" className="text-sm underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Net worth over time</h1>
        <Timeline />
      </main>
    </AppGate>
  );
}
