import Link from "next/link";
import { Accounts } from "@/features/accounts/accounts";
import { AppGate } from "@/features/auth/app-gate";

export default function AccountsPage() {
  return (
    <AppGate>
      <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
        <Link href="/" className="text-sm underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <Accounts />
      </main>
    </AppGate>
  );
}
