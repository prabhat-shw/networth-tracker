// Inlined at build time (next.config.ts), so staging cannot drop the banner at runtime.
export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      Demo environment: synthetic data only. Never enter real financial
      information here.
    </div>
  );
}
