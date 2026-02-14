import { useState, useEffect, useCallback } from "react";
import type { Group, OTPAccount } from "../types";
import {
  loadGroups,
  saveGroups,
  createGroup,
  renameGroup,
  deleteGroup,
} from "../lib/group-manager";

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadGroups();
        if (!cancelled) {
          setGroups(data);
        }
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
  }, []);

  const addGroup = useCallback(
    async (name: string) => {
      try {
        setError(null);
        const updated = createGroup(groups, name);
        setGroups(updated);
        await saveGroups(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建分组失败");
        throw err;
      }
    },
    [groups],
  );

  const editGroup = useCallback(
    async (groupId: string, newName: string) => {
      try {
        setError(null);
        const updated = renameGroup(groups, groupId, newName);
        setGroups(updated);
        await saveGroups(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "编辑分组失败");
        throw err;
      }
    },
    [groups],
  );

  const removeGroup = useCallback(
    async (groupId: string, accounts: OTPAccount[]) => {
      try {
        setError(null);
        const result = deleteGroup(groups, accounts, groupId);
        setGroups(result.groups);
        await saveGroups(result.groups);
        return result.accounts;
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除分组失败");
        throw err;
      }
    },
    [groups],
  );

  return { groups, setGroups, loading, error, addGroup, editGroup, removeGroup };
}
