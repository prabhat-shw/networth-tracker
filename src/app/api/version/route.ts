import { BUILD } from "@/lib/version";

// Never cached: this endpoint is how a running tab discovers it is out of date.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(BUILD, {
    headers: { "cache-control": "no-store, must-revalidate" },
  });
}
