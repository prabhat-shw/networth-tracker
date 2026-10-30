import Link from "next/link";
import { AppGate } from "@/features/auth/app-gate";
import { Goals } from "@/features/goals/goals";

export default function GoalsPage() {
  return (
    <AppGate>
      <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
        <Link href="/" className="text-sm underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Goals</h1>
        <Goals />
      </main>
    </AppGate>
  );
}
