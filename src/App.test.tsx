import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Group, OTPAccount } from "./types";
import App from "./App";

const mocks = vi.hoisted(() => ({
  setGroupsMock: vi.fn(),
  setAccountsMock: vi.fn(),
  addNewAccountsMock: vi.fn().mockResolvedValue(undefined),
  batchDeleteAccountsMock: vi.fn().mockResolvedValue(undefined),
  saveGroupsMock: vi.fn().mockResolvedValue(undefined),
  saveAccountsMock: vi.fn().mockResolvedValue(undefined),
  toastMock: vi.fn(),
  accountsState: [] as OTPAccount[],
  groupsState: [] as Group[],
  lastAccountPageProps: null as null | Record<string, unknown>,
  lastBackupPanelProps: null as null | Record<string, unknown>,
}));

const updatedGroups: Group[] = [
  { id: "default", name: "默认", isDefault: true, createdAt: 0 },
  { id: "github", name: "GitHub", isDefault: false, createdAt: 1 },
];

const importedGroups: Group[] = [
  { id: "default", name: "默认", isDefault: true, createdAt: 0 },
  { id: "google-imported", name: "Google", isDefault: false, createdAt: 2 },
];

const importedAccounts: OTPAccount[] = [
  {
    id: "imported-duplicate",
    issuer: "GitHub",
    name: "alice@example.com",
    secret: "SECRET-1",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: 10,
    groupId: "default",
    order: 0,
  },
  {
    id: "imported-unique",
    issuer: "Google",
    name: "bob@example.com",
    secret: "SECRET-2",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: 11,
    groupId: "google-imported",
    order: 0,
  },
];

vi.mock("./hooks/useAccounts", () => ({
  normalizeLoadedAccounts: (data: OTPAccount[]) => ({
    accounts: data,
    needsMigration: false,
  }),
  useAccounts: () => ({
    accounts: mocks.accountsState,
    setAccounts: (next: OTPAccount[]) => {
      mocks.accountsState = next;
      mocks.setAccountsMock(next);
    },
    getLatestAccounts: () => mocks.accountsState,
    isAccountsLoaded: () => true,
    invalidateAccountsLoaded: vi.fn(),
    commitAccounts: async (computeNext: (current: OTPAccount[]) => OTPAccount[] | null) => {
      const next = computeNext(mocks.accountsState);
      if (next === null) {
        return false;
      }
      await mocks.saveAccountsMock(next);
      mocks.accountsState = next;
      mocks.setAccountsMock(next);
      return true;
    },
    runSerializedAccountWrite: <T,>(task: () => Promise<T>) => task(),
    loading: false,
    error: null,
    addNewAccounts: mocks.addNewAccountsMock,
    deleteAccount: vi.fn(),
    batchDeleteAccounts: mocks.batchDeleteAccountsMock,
    editAccount: vi.fn(),
    batchMoveToGroup: vi.fn(),
    refreshAccounts: vi.fn(),
  }),
}));

vi.mock("./hooks/useGroups", () => ({
  useGroups: () => ({
    groups: mocks.groupsState,
    setGroups: (next: Group[]) => {
      mocks.groupsState = next;
      mocks.setGroupsMock(next);
    },
    getLatestGroups: () => mocks.groupsState,
    isGroupsLoaded: () => true,
    invalidateGroupsLoaded: vi.fn(),
    loading: false,
    error: null,
    addGroup: vi.fn(),
    editGroup: vi.fn(),
    removeGroup: vi.fn(),
  }),
}));

vi.mock("./lib/group-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/group-manager")>();
  return {
    ...actual,
    saveGroups: mocks.saveGroupsMock,
  };
});

vi.mock("./lib/account-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/account-manager")>();
  return {
    ...actual,
    saveAccounts: mocks.saveAccountsMock,
  };
});

vi.mock("./components/Sidebar", () => ({
  default: () => <div>sidebar</div>,
}));

vi.mock("./components/HomePage", () => ({
  default: ({ onGroupsUpdated }: { onGroupsUpdated: (groups: Group[]) => void }) => (
    <button type="button" onClick={() => onGroupsUpdated(updatedGroups)}>
      trigger-groups-updated
    </button>
  ),
}));

vi.mock("./components/AccountPage", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.lastAccountPageProps = props;
    const onSelectedIdsChange = props.onSelectedIdsChange as (ids: Set<string>) => void;
    const onSearchQueryChange = props.onSearchQueryChange as (q: string) => void;
    const onReorder = props.onReorder as (accs: OTPAccount[]) => void;
    return (
      <div>
        <span data-testid="account-page-focus-tick">{String(props.focusSearchTick ?? 0)}</span>
        <button type="button" onClick={() => onSelectedIdsChange(new Set(["a1", "a2"]))}>
          select-both
        </button>
        <button type="button" onClick={() => onSearchQueryChange("GitHub")}>
          filter-github
        </button>
        <button
          type="button"
          onClick={() =>
            onReorder([mocks.accountsState[0]].filter(Boolean))
          }
        >
          trigger-partial-reorder
        </button>
        <button
          type="button"
          onClick={() =>
            onReorder([mocks.accountsState[0], mocks.accountsState[0]].filter(Boolean))
          }
        >
          trigger-duplicate-reorder
        </button>
        <button
          type="button"
          onClick={() =>
            onReorder([
              mocks.accountsState[0],
              { ...mocks.accountsState[1], id: "unknown-id" },
            ].filter(Boolean) as OTPAccount[])
          }
        >
          trigger-unknown-reorder
        </button>
      </div>
    );
  },
}));

vi.mock("./components/GroupPage", () => ({
  default: () => null,
}));

vi.mock("./components/TempPanel", () => ({
  TempPanel: () => null,
}));

vi.mock("./components/DedupDialog", () => ({
  default: () => null,
}));

vi.mock("./components/Toast", () => ({
  default: () => null,
}));

vi.mock("./components/BackupPanel", () => ({
  default: (props: {
    onImport: (accounts: OTPAccount[], groups: Group[]) => Promise<void> | void;
    selectedAccountIds?: Set<string>;
  }) => {
    mocks.lastBackupPanelProps = props;
    return (
      <div>
        <span data-testid="backup-selected-count">
          {props.selectedAccountIds ? props.selectedAccountIds.size : -1}
        </span>
        <button
          type="button"
          onClick={() => {
            void Promise.resolve(props.onImport(importedAccounts, importedGroups)).catch(() => {});
          }}
        >
          trigger-backup-import
        </button>
      </div>
    );
  },
}));

vi.mock("./components/WebDavSyncPanel", () => ({
  default: () => null,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addNewAccountsMock.mockResolvedValue(undefined);
    mocks.batchDeleteAccountsMock.mockResolvedValue(undefined);
    mocks.saveGroupsMock.mockResolvedValue(undefined);
    mocks.saveAccountsMock.mockResolvedValue(undefined);
    mocks.accountsState = [];
    mocks.groupsState = [{ id: "default", name: "默认", isDefault: true, createdAt: 0 }];
    mocks.lastAccountPageProps = null;
    mocks.lastBackupPanelProps = null;
  });

  it("persists groups when the home page updates groups after image import", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "trigger-groups-updated" }));

    await waitFor(() => {
      expect(mocks.setGroupsMock).toHaveBeenCalledWith(updatedGroups);
      expect(mocks.saveGroupsMock).toHaveBeenCalledWith(updatedGroups);
    });
  });

  it("merges imported backup data instead of replacing existing accounts", async () => {
    mocks.accountsState = [
      {
        id: "existing-1",
        issuer: "GitHub",
        name: "alice@example.com",
        secret: "SECRET-1",
        type: "totp",
        counter: 0,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        createdAt: 1,
        groupId: "default",
        order: 0,
      },
    ];
    mocks.groupsState = [{ id: "default", name: "默认", isDefault: true, createdAt: 0 }];

    const existingAccount = mocks.accountsState[0];
    const defaultGroup = mocks.groupsState[0];

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "trigger-backup-import" }));

    await waitFor(() => {
      expect(mocks.setAccountsMock).toHaveBeenCalledWith([
        existingAccount,
        expect.objectContaining({
          id: "imported-unique",
          issuer: "Google",
          groupId: "google-imported",
          order: 1,
        }),
      ]);
      expect(mocks.setGroupsMock).toHaveBeenCalledWith([
        defaultGroup,
        importedGroups[1],
      ]);
      expect(mocks.saveAccountsMock).toHaveBeenCalledWith([
        existingAccount,
        expect.objectContaining({
          id: "imported-unique",
          issuer: "Google",
          groupId: "google-imported",
          order: 1,
        }),
      ]);
      expect(mocks.saveGroupsMock).toHaveBeenCalledWith([
        defaultGroup,
        importedGroups[1],
      ]);
    });
  });

  it("rolls back saved groups and leaves React state untouched if saveAccounts fails during backup import", async () => {
    const initialGroups: Group[] = [{ id: "default", name: "默认", isDefault: true, createdAt: 0 }];
    mocks.accountsState = [
      {
        id: "existing-1",
        issuer: "GitHub",
        name: "alice@example.com",
        secret: "SECRET-1",
        type: "totp",
        counter: 0,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        createdAt: 1,
        groupId: "default",
        order: 0,
      },
    ];
    mocks.groupsState = initialGroups;
    mocks.saveAccountsMock.mockRejectedValueOnce(new Error("accounts write failed"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "trigger-backup-import" }));

    await waitFor(() => {
      expect(mocks.saveGroupsMock).toHaveBeenCalledTimes(2);
    });
    expect(mocks.saveGroupsMock).toHaveBeenNthCalledWith(1, [initialGroups[0], importedGroups[1]]);
    expect(mocks.saveGroupsMock).toHaveBeenNthCalledWith(2, initialGroups);
    expect(mocks.setGroupsMock).not.toHaveBeenCalled();
    expect(mocks.setAccountsMock).not.toHaveBeenCalled();
  });

  it("switches to accounts page on Ctrl+K, clears selection on search change, and ignores partial reorders", async () => {
    mocks.accountsState = [
      {
        id: "a1",
        issuer: "GitHub",
        name: "alice@example.com",
        secret: "SECRET-1",
        type: "totp",
        counter: 0,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        createdAt: 1,
        groupId: "default",
        order: 0,
      },
      {
        id: "a2",
        issuer: "Google",
        name: "bob@example.com",
        secret: "SECRET-2",
        type: "totp",
        counter: 0,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        createdAt: 2,
        groupId: "default",
        order: 1,
      },
    ];

    render(<App />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByTestId("account-page-focus-tick")).toHaveTextContent("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "select-both" }));
    expect(screen.getByTestId("backup-selected-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "filter-github" }));
    expect(screen.getByTestId("backup-selected-count")).toHaveTextContent("0");

    fireEvent.click(screen.getByRole("button", { name: "trigger-partial-reorder" }));
    fireEvent.click(screen.getByRole("button", { name: "trigger-duplicate-reorder" }));
    fireEvent.click(screen.getByRole("button", { name: "trigger-unknown-reorder" }));
    expect(mocks.saveAccountsMock).not.toHaveBeenCalled();
  });
});
