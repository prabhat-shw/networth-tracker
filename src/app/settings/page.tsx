import Link from "next/link";
import { AppGate } from "@/features/auth/app-gate";
import { SecuritySettings } from "@/features/settings/security-settings";

export default function Settings() {
  return (
    <AppGate>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-8">
        <Link href="/" className="text-sm underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <SecuritySettings />
      </main>
    </AppGate>
  );
}
