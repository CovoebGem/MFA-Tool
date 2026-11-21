import { useState, useEffect, useCallback, useRef } from "react";
import type { Group, OTPAccount } from "../types";
import {
  loadGroups,
  saveGroups,
  createGroup,
  renameGroup,
  deleteGroup,
} from "../lib/group-manager";

interface UseGroupsOptions {
  runSerializedWrite?: <T>(task: () => Promise<T>) => Promise<T>;
}

export function useGroups(options: UseGroupsOptions = {}) {
  const [groups, setGroupsState] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const groupsRef = useRef<Group[]>([]);
  const loadedRef = useRef(false);
  const internalQueueRef = useRef<Promise<void>>(Promise.resolve());

  const defaultRunSerializedWrite = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = internalQueueRef.current.then(task, task);
    internalQueueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const runSerialized = options.runSerializedWrite ?? defaultRunSerializedWrite;

  const setGroupsSnapshot = useCallback((nextGroups: Group[]) => {
    groupsRef.current = nextGroups;
    loadedRef.current = true;
    setGroupsState(nextGroups);
  }, []);

  const getLatestGroups = useCallback(() => groupsRef.current, []);
  const isGroupsLoaded = useCallback(() => loadedRef.current, []);
  const invalidateGroupsLoaded = useCallback(() => {
    loadedRef.current = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await runSerialized(async () => {
          const data = await loadGroups();
          if (!cancelled) {
            groupsRef.current = data;
            loadedRef.current = true;
            setGroupsState(data);
          }
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载分组失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runSerialized]);

  const addGroup = useCallback(
    async (name: string) => {
      try {
        await runSerialized(async () => {
          if (!loadedRef.current) {
            throw new Error("分组尚未加载成功，已阻止覆盖写入，请先重试刷新");
          }
          setError(null);
          const updated = createGroup(groupsRef.current, name);
          await saveGroups(updated);
          groupsRef.current = updated;
          setGroupsState(updated);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建分组失败");
        throw err;
      }
    },
    [runSerialized],
  );

  const editGroup = useCallback(
    async (groupId: string, newName: string) => {
      try {
        await runSerialized(async () => {
          if (!loadedRef.current) {
            throw new Error("分组尚未加载成功，已阻止覆盖写入，请先重试刷新");
          }
          setError(null);
          const updated = renameGroup(groupsRef.current, groupId, newName);
          await saveGroups(updated);
          groupsRef.current = updated;
          setGroupsState(updated);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "编辑分组失败");
        throw err;
      }
    },
    [runSerialized],
  );

  const removeGroup = useCallback(
    async (groupId: string, accounts: OTPAccount[]) => {
      try {
        return await runSerialized(async () => {
          if (!loadedRef.current) {
            throw new Error("分组尚未加载成功，已阻止覆盖写入，请先重试刷新");
          }
          setError(null);
          const result = deleteGroup(groupsRef.current, accounts, groupId);
          await saveGroups(result.groups);
          groupsRef.current = result.groups;
          setGroupsState(result.groups);
          return result.accounts;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除分组失败");
        throw err;
      }
    },
    [runSerialized],
  );

  return {
    groups,
    setGroups: setGroupsSnapshot,
    getLatestGroups,
    isGroupsLoaded,
    invalidateGroupsLoaded,
    loading,
    error,
    addGroup,
    editGroup,
    removeGroup,
  };
}