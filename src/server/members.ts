/**
 * Household member relay and in-app invite (ADR-0023, on top of ADR-0019/0021/0022).
 * The server relays wrapped HDKs it cannot open. It decides only *who* may receive a wrap:
 * an invitee of this household with an identity vault, whose public key it copies from
 * that vault, never from the request. Members still compare fingerprints out of band.
 */
import { and, eq, gt, type SQL, sql } from "drizzle-orm";
import { fromBase64url, toBase64url, VaultFormatError } from "@/crypto/wire";
import {
  householdInvites,
  householdMembers,
  households,
  identityVaults,
  invites,
  user,
} from "./db/schema";
import { deny, type GuardDeps, guardHousehold, UUID } from "./guard";
import { emailHash, INVITE_TTL_DAYS } from "./invites";

const MAX_BODY_BYTES = 4096;
/** Wrap blob (ADR-0019): 1 + 65 + 16 + 1 + kid (0–255) + 40 bytes. */
const WRAP_BYTES = { min: 123, max: 378 } as const;
const MAX_EMAIL_CHARS = 254;

const fail = (status: 409 | 413 | 415, error: string) =>
  Response.json({ error }, { status });
const noStore = { "cache-control": "no-store" };

/** Parses a small JSON object with exactly `keys`, or answers the error response. */
async function readBody(
  request: Request,
  keys: string[],
): Promise<Record<string, unknown> | Response> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return fail(415, "content-type must be application/json");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
    return fail(413, "body too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return deny(400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return deny(400);
  const got = Object.keys(body).sort().join();
  if (got !== [...keys].sort().join()) return deny(400);
  return body as Record<string, unknown>;
}

function wrapBytes(x: unknown): Uint8Array | null {
  if (typeof x !== "string") return null;
  try {
    const bytes = fromBase64url(x);
    const ok =
      bytes.length >= WRAP_BYTES.min &&
      bytes.length <= WRAP_BYTES.max &&
      bytes[0] === 0x01;
    return ok ? bytes : null;
  } catch (e) {
    if (e instanceof VaultFormatError) return null;
    throw e;
  }
}

const uuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

/**
 * `invites.emailHash` recomputed from a stored address, same normalisation as
 * `normaliseEmail` (NFKC, trim, lower-case), so an invite can be matched to an account.
 */
const userEmailHash = sql`sha256(convert_to(lower(btrim(normalize(${user.email}, NFKC))), 'UTF8'))`;

/** `POST /api/households` — `{ id, wrappedHdk }`: new household plus the caller's own wrap. */
export async function createHousehold(
  deps: GuardDeps,
  request: Request,
): Promise<Response> {
  const userId = await deps.sessionUser(request.headers);
  if (!userId) return deny(401);
  const body = await readBody(request, ["id", "wrappedHdk"]);
  if (body instanceof Response) return body;
  const wrappedHdk = wrapBytes(body.wrappedHdk);
  if (!uuid(body.id) || !wrappedHdk) return deny(400);
  const id = body.id.toLowerCase();

  const [vault] = await deps.db
    .select({ publicKey: identityVaults.publicKey })
    .from(identityVaults)
    .where(eq(identityVaults.userId, userId))
    .limit(1);
  if (!vault) return fail(409, "identity vault required");

  const created = await deps.db.transaction(async (tx) => {
    const rows = await tx
      .insert(households)
      .values({ id })
      .onConflictDoNothing()
      .returning({ id: households.id });
    if (rows.length === 0) return false;
    await tx.insert(householdMembers).values({
      householdId: id,
      memberId: userId,
      publicKey: vault.publicKey,
      wrappedHdk,
    });
    return true;
  });
  if (!created) return fail(409, "household id taken");
  return Response.json({ id }, { status: 201 });
}

/** `GET …/members` — the caller's own wrap and every member's identity public key. */
export async function listMembers(
  deps: GuardDeps,
  request: Request,
  householdId: string,
): Promise<Response> {
  const guard = await guardHousehold(deps, request.headers, householdId);
  if (!guard.ok) return guard.response;
  const rows = await deps.db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(householdMembers.createdAt);
  const self = rows.find((r) => r.memberId === guard.userId);
  return Response.json(
    {
      wrappedHdk: self ? toBase64url(self.wrappedHdk) : null,
      members: rows.map((r) => ({
        userId: r.memberId,
        publicKey: toBase64url(r.publicKey),
        joinedAt: r.createdAt.toISOString(),
      })),
    },
    { headers: noStore },
  );
}

/**
 * `POST …/invites` — `{ email }`: invites an address to this household, and opens (or
 * extends) its ADR-0020 sign-up invite so a newcomer can create an account.
 */
export async function inviteMember(
  deps: GuardDeps,
  request: Request,
  householdId: string,
): Promise<Response> {
  const guard = await guardHousehold(deps, request.headers, householdId);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, ["email"]);
  if (body instanceof Response) return body;
  const { email } = body;
  if (
    typeof email !== "string" ||
    email.length > MAX_EMAIL_CHARS ||
    !/^[^@\s]+@[^@\s]+$/.test(email.trim())
  )
    return deny(400);

  const hash = await emailHash(email);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  await deps.db.transaction(async (tx) => {
    await tx
      .insert(householdInvites)
      .values({
        householdId,
        emailHash: hash,
        invitedBy: guard.userId,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [householdInvites.householdId, householdInvites.emailHash],
        set: { invitedBy: guard.userId, expiresAt },
      });
    await tx
      .insert(invites)
      .values({ emailHash: hash, expiresAt })
      .onConflictDoUpdate({
        target: invites.emailHash,
        set: { expiresAt },
        setWhere: sql`${invites.consumedAt} is null`,
      });
  });
  return new Response(null, { status: 204 });
}

/** Open invites joined to the invitee's account and vault, where both exist. */
function openInvites(deps: GuardDeps, householdId: string, extra?: SQL) {
  return deps.db
    .select({
      emailHash: householdInvites.emailHash,
      expiresAt: householdInvites.expiresAt,
      userId: user.id,
      email: user.email,
      publicKey: identityVaults.publicKey,
    })
    .from(householdInvites)
    .leftJoin(user, sql`${userEmailHash} = ${householdInvites.emailHash}`)
    .leftJoin(identityVaults, eq(identityVaults.userId, user.id))
    .where(
      and(
        eq(householdInvites.householdId, householdId),
        gt(householdInvites.expiresAt, sql`now()`),
        extra,
      ),
    );
}

/**
 * `GET …/invites` — open invites. `invitee` is filled in once the invited address has an
 * account and a vault: that public key is what the inviter wraps the HDK to.
 */
export async function listInvites(
  deps: GuardDeps,
  request: Request,
  householdId: string,
): Promise<Response> {
  const guard = await guardHousehold(deps, request.headers, householdId);
  if (!guard.ok) return guard.response;
  const rows = await openInvites(deps, householdId).orderBy(
    householdInvites.createdAt,
  );
  return Response.json(
    {
      invites: rows.map((r) => ({
        emailHash: toBase64url(r.emailHash),
        expiresAt: r.expiresAt.toISOString(),
        invitee:
          r.userId && r.email && r.publicKey
            ? {
                userId: r.userId,
                email: r.email,
                publicKey: toBase64url(r.publicKey),
              }
            : null,
      })),
    },
    { headers: noStore },
  );
}

/**
 * `POST …/members` — `{ userId, wrappedHdk }`: relays the HDK wrapped to an invitee. Only
 * for an open invite of this household whose account has a vault; consumes the invite.
 */
export async function addMember(
  deps: GuardDeps,
  request: Request,
  householdId: string,
): Promise<Response> {
  const guard = await guardHousehold(deps, request.headers, householdId);
  if (!guard.ok) return guard.response;
  const body = await readBody(request, ["userId", "wrappedHdk"]);
  if (body instanceof Response) return body;
  const wrappedHdk = wrapBytes(body.wrappedHdk);
  if (!uuid(body.userId) || !wrappedHdk) return deny(400);
  const memberId = body.userId.toLowerCase();

  const [invite] = await openInvites(
    deps,
    householdId,
    eq(user.id, memberId),
  ).limit(1);
  if (!invite?.publicKey) return deny(404);
  const { publicKey } = invite;

  const added = await deps.db.transaction(async (tx) => {
    const rows = await tx
      .insert(householdMembers)
      .values({ householdId, memberId, publicKey, wrappedHdk })
      .onConflictDoNothing()
      .returning({ id: householdMembers.memberId });
    await tx
      .delete(householdInvites)
      .where(
        and(
          eq(householdInvites.householdId, householdId),
          eq(householdInvites.emailHash, invite.emailHash),
        ),
      );
    return rows.length > 0;
  });
  if (!added) return fail(409, "already a member");
  return new Response(null, { status: 201 });
}
