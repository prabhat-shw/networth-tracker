/**
 * The engine's transport over the household records routes (CONTRACT.md *Records*,
 * ADR-0045). Only sealed bytes, ids and versions are sent; ciphertext travels as base64url.
 */
import { fromBase64url, toBase64url } from "@/crypto/wire";
import type { RemoteEnvelope, Transport } from "./engine";

interface WireEnvelope {
  id: string;
  version: number;
  seq: number;
  deleted: boolean;
  ciphertext: string;
}

export class SyncHttpError extends Error {
  constructor(readonly status: number) {
    super(`sync request failed: ${status}`);
    this.name = "SyncHttpError";
  }
}

const fromWire = (r: WireEnvelope): RemoteEnvelope => ({
  id: r.id,
  version: r.version,
  seq: r.seq,
  deleted: r.deleted,
  ciphertext: fromBase64url(r.ciphertext),
});

export function httpTransport(
  householdId: string,
  fetcher: typeof fetch = fetch,
): Transport {
  const url = `/api/households/${encodeURIComponent(householdId)}/records`;
  const call = async <T>(input: string, init?: RequestInit): Promise<T> => {
    const res = await fetcher(input, { credentials: "same-origin", ...init });
    if (!res.ok) throw new SyncHttpError(res.status);
    return (await res.json()) as T;
  };
  return {
    async pull(since) {
      const body = await call<{ records: WireEnvelope[] }>(
        `${url}?since=${since}`,
      );
      return body.records.map(fromWire);
    },
    async push(records) {
      const body = await call<{
        applied: { id: string; version: number; seq: number }[];
        conflicts: WireEnvelope[];
      }>(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          records: records.map((r) => ({
            id: r.id,
            version: r.version,
            deleted: r.deleted,
            ciphertext: toBase64url(r.ciphertext),
          })),
        }),
      });
      return {
        applied: body.applied.map(({ id, version, seq }) => ({
          id,
          version,
          seq,
        })),
        conflicts: body.conflicts.map(fromWire),
      };
    },
  };
}
