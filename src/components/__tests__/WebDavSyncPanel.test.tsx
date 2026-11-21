import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import WebDavSyncPanel from "../WebDavSyncPanel";
import { useAccounts } from "../../hooks/useAccounts";
import { useGroups } from "../../hooks/useGroups";
import { saveAccounts } from "../../lib/account-manager";
import { saveGroups } from "../../lib/group-manager";
import { mergeWebDavSyncData } from "../../lib/webdav-sync";
import type { Group, OTPAccount } from "../../types";

const store = vi.hoisted(() => ({
  accountsJson: "[]",
  groupsJson: JSON.stringify([{ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }]),
  readWebDavSync: vi.fn(),
  writeWebDavSync: vi.fn(),
  hasSavedWebDavPassword: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: { data?: string }) => {
    switch (cmd) {
      case "read_accounts":
        return store.accountsJson;
      case "write_accounts":
        store.accountsJson = args?.data ?? "[]";
        return undefined;
      case "read_groups":
        return store.groupsJson;
      case "write_groups":
        store.groupsJson = args?.data ?? "[]";
        return undefined;
      default:
        throw new Error(`Unexpected command: ${cmd}`);
    }
  }),
}));

vi.mock("../../lib/webdav-client", () => ({
  testWebDavConnection: vi.fn(),
  readWebDavSync: store.readWebDavSync,
  writeWebDavSync: store.writeWebDavSync,
  hasSavedWebDavPassword: store.hasSavedWebDavPassword,
  saveWebDavPassword: vi.fn(),
  clearSavedWebDavPassword: vi.fn(),
}));

function makeAccount(id: string, updatedAt = 100): OTPAccount {
  return {
    id,
    issuer: "GitHub",
    name: `${id}@example.com`,
    secret: `SECRET_${id.toUpperCase()}`,
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: updatedAt,
    updatedAt,
    groupId: "default",
    order: 0,
  };
}

function createStorageMock() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

function createHarness() {
  const snapshot = {
    addAccounts: null as ((items: OTPAccount[]) => Promise<void>) | null,
    accounts: [] as OTPAccount[],
  };
  const onToast = vi.fn();

  function SyncHarness() {
    const {
      accounts,
      setAccounts,
      getLatestAccounts,
      isAccountsLoaded,
      runSerializedAccountWrite,
      loading: accountsLoading,
      addNewAccounts,
    } = useAccounts();
    const {
      groups,
      setGroups,
      getLatestGroups,
      isGroupsLoaded,
      loading: groupsLoading,
    } = useGroups({ runSerializedWrite: runSerializedAccountWrite });

    useEffect(() => {
      snapshot.addAccounts = addNewAccounts;
      snapshot.accounts = accounts;
    }, [addNewAccounts, accounts]);

    const handleMergeRemoteData = async (remoteAccounts: OTPAccount[], remoteGroups: Group[]) => {
      return await runSerializedAccountWrite(async () => {
        if (!isAccountsLoaded() || !isGroupsLoaded()) {
          throw new Error("数据尚未加载完成");
        }
        const currentAccounts = getLatestAccounts();
        const currentGroups = getLatestGroups();
        const merged = mergeWebDavSyncData(
          currentAccounts,
          currentGroups,
          remoteAccounts,
          remoteGroups,
        );
        await saveGroups(merged.groups);
        await saveAccounts(merged.accounts);
        setGroups(merged.groups);
        setAccounts(merged.accounts);
        return { accounts: merged.accounts, groups: merged.groups };
      });
    };

    const handleGetLatestSnapshot = async () =>
      await runSerializedAccountWrite(async () => ({
        accounts: getLatestAccounts(),
        groups: getLatestGroups(),
      }));

    if (accountsLoading || groupsLoading) {
      return <div>加载中</div>;
    }

    return (
      <WebDavSyncPanel
        accounts={accounts}
        groups={groups}
        onMergeRemoteData={handleMergeRemoteData}
        onGetLatestSnapshot={handleGetLatestSnapshot}
        onToast={onToast}
      />
    );
  }

  return {
    SyncHarness,
    getAddAccounts: () => snapshot.addAccounts!,
    getAccounts: () => snapshot.accounts,
    onToast,
  };
}

describe("WebDavSyncPanel concurrent local write safety", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.defineProperty(window, "localStorage", {
      value: createStorageMock(),
      configurable: true,
    });
    window.localStorage.setItem(
      "mfa-tool:webdav-config",
      JSON.stringify({
        baseUrl: "https://dav.example.com/remote.php/dav/files/alice",
        path: "/MFA-Tool/",
        username: "alice",
      }),
    );

    const existing = makeAccount("existing", 10);
    store.accountsJson = JSON.stringify([existing]);
    store.groupsJson = JSON.stringify([
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
    ]);
    store.hasSavedWebDavPassword.mockResolvedValue(true);
    store.writeWebDavSync.mockResolvedValue(undefined);
  });

  it("立即同步时，在 GET 等待期间新增的本地账户不会被覆盖，且上传快照包含新账户", async () => {
    let resolveRemote!: (value: string | null) => void;
    store.readWebDavSync.mockImplementationOnce(
      () => new Promise<string | null>((resolve) => {
        resolveRemote = resolve;
      }),
    );

    const harness = createHarness();
    render(<harness.SyncHarness />);

    const syncButton = await screen.findByRole("button", { name: "立即同步" });
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(store.readWebDavSync).toHaveBeenCalledTimes(1);
    });

    const localAdded = makeAccount("local_added", 200);
    await act(async () => {
      await harness.getAddAccounts()([localAdded]);
    });

    const remoteAdded = makeAccount("remote_added", 150);
    await act(async () => {
      resolveRemote(
        JSON.stringify({
          version: 1,
          exportedAt: "2026-11-21T00:00:00.000Z",
          groups: JSON.parse(store.groupsJson),
          accounts: [makeAccount("existing", 10), remoteAdded],
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(store.writeWebDavSync).toHaveBeenCalledTimes(1);
    });

    const persistedIds = (JSON.parse(store.accountsJson) as OTPAccount[]).map((a) => a.id);
    expect(persistedIds).toEqual(expect.arrayContaining(["existing", "local_added", "remote_added"]));

    const uploadedJson = store.writeWebDavSync.mock.calls[0][2] as string;
    const uploadedIds = (JSON.parse(uploadedJson).accounts as OTPAccount[]).map((a) => a.id);
    expect(uploadedIds).toEqual(expect.arrayContaining(["existing", "local_added", "remote_added"]));
  });

  it("拉取并合并时，在 GET 等待期间新增的本地账户不会被覆盖", async () => {
    let resolveRemote!: (value: string | null) => void;
    store.readWebDavSync.mockImplementationOnce(
      () => new Promise<string | null>((resolve) => {
        resolveRemote = resolve;
      }),
    );

    const harness = createHarness();
    render(<harness.SyncHarness />);

    const pullButton = await screen.findByRole("button", { name: "拉取并合并" });
    fireEvent.click(pullButton);

    await waitFor(() => {
      expect(store.readWebDavSync).toHaveBeenCalledTimes(1);
    });

    const localAdded = makeAccount("local_added", 200);
    await act(async () => {
      await harness.getAddAccounts()([localAdded]);
    });

    const remoteAdded = makeAccount("remote_added", 150);
    await act(async () => {
      resolveRemote(
        JSON.stringify({
          version: 1,
          exportedAt: "2026-11-21T00:00:00.000Z",
          groups: JSON.parse(store.groupsJson),
          accounts: [makeAccount("existing", 10), remoteAdded],
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      const persistedIds = (JSON.parse(store.accountsJson) as OTPAccount[]).map((a) => a.id);
      expect(persistedIds).toEqual(expect.arrayContaining(["existing", "local_added", "remote_added"]));
    });

    expect(harness.getAccounts().map((a) => a.id)).toEqual(
      expect.arrayContaining(["existing", "local_added", "remote_added"]),
    );
  });
});
