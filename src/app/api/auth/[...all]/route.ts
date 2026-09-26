import { getAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Better Auth owns everything under /api/auth (ADR-0020). */
const handle = (request: Request) => getAuth().handler(request);

export { handle as GET, handle as POST };
