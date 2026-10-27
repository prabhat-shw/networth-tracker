"use client";

import { useCallback, useMemo } from "react";
import {
  type KnownType,
  ownProfile,
  prepareWrite,
  type TypeData,
  typeRecords,
} from "@/domain/records/typed";
import { useHouseholdSync, useRecords } from "./sync-provider";

/** The live records, typed per envelope type (ADR-0054). Recomputed only when they change. */
export function useTypedRecords() {
  const records = useRecords();
  return useMemo(() => typeRecords(records), [records]);
}

export const useAssets = () => useTypedRecords().asset;
export const useLiabilities = () => useTypedRecords().liability;
export const useGoals = () => useTypedRecords().goal;
export const useMembers = () => useTypedRecords().profiles;

/** This member's own profile, or undefined until they set a name. */
export function useOwnProfile() {
  const typed = useTypedRecords();
  const userId = useHouseholdSync()?.userId;
  return userId ? ownProfile(typed, userId) : undefined;
}

/**
 * Validated writes. `save` throws `InvalidRecordError` before anything is sealed when the
 * data is invalid, or when the stored record is another type, newer or unreadable here.
 */
export function useRecordWriter() {
  const sync = useHouseholdSync();
  const records = useRecords();
  const save = useCallback(
    async <K extends KnownType>(type: K, data: TypeData[K], id?: string) => {
      if (!sync) throw new Error("sync not started");
      const existing = id ? records.find((r) => r.id === id) : undefined;
      const w = prepareWrite(type, data, existing);
      return sync.write(
        id ?? crypto.randomUUID(),
        w.type,
        w.data,
        false,
        w.schemaVersion,
      );
    },
    [sync, records],
  );
  /** A tombstone keeps no data, so any record may be deleted (ADR-0051). */
  const remove = useCallback(
    async (id: string) => {
      if (!sync) throw new Error("sync not started");
      const existing = records.find((r) => r.id === id);
      if (!existing) return;
      return sync.write(id, existing.type, null, true, existing.schemaVersion);
    },
    [sync, records],
  );
  return { save, remove };
}
