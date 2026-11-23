import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Group, OTPAccount } from "./types";
import App from "./App";

const mocks = vi.hoisted(() => {
  const setAccountsMock = vi.fn();
  const setGroupsMock = vi.fn();
  const saveAccountsMock = vi.fn().mockResolvedValue(undefined);
  const saveGroupsMock = vi.fn().mockResolvedValue(undefined);
  const state = {
    setGroupsMock,
    setAccountsMock,
    addNewAccountsMock: vi.fn().mockResolvedValue(undefined),
    deleteAccountMock: vi.fn(),
    editAccountMock: vi.fn(),
    togglePinAccountMock: vi.fn(),
    batchDeleteAccountsMock: vi.fn().mockResolvedValue(undefined),
    batchSetPinnedMock: vi.fn().mockResolvedValue(undefined),
    batchMoveToGroupMock: vi.fn(),
    refreshAccountsMock: vi.fn(),
    addGroupMock: vi.fn(),
    editGroupMock: vi.fn(),
    removeGroupMock: vi.fn(),
    saveGroupsMock,
    saveAccountsMock,
    toastMock: vi.fn(),
    accountsState: [] as OTPAccount[],
    groupsState: [] as Group[],
    lastAccountPageProps: null as null | Record<string, unknown>,
    lastBackupPanelProps: null as null | Record<string, unknown>,
    accountPageRenderCount: 0,
    recordAccountPageRender: (props: Record<string, unknown>) => {
      state.accountPageRenderCount += 1;
      state.lastAccountPageProps = props;
    },
    setAccountsStable: (next: OTPAccount[]) => {
      state.accountsState = next;
      setAccountsMock(next);
    },
    getLatestAccounts: () => state.accountsState,
    isAccountsLoaded: () => true,
    invalidateAccountsLoaded: vi.fn(),
    commitAccounts: async (computeNext: (current: OTPAccount[]) => OTPAccount[] | null) => {
      const next = computeNext(state.accountsState);
      if (next === null) {
        return false;
      }
      await saveAccountsMock(next);
      state.accountsState = next;
      setAccountsMock(next);
      return true;
    },
    runSerializedAccountWrite: <T,>(task: () => Promise<T>) => task(),
    setGroupsStable: (next: Group[]) => {
      state.groupsState = next;
      setGroupsMock(next);
    },
    getLatestGroups: () => state.groupsState,
    isGroupsLoaded: () => true,
    invalidateGroupsLoaded: vi.fn(),
  };
  return state;
});

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
    setAccounts: mocks.setAccountsStable,
    getLatestAccounts: mocks.getLatestAccounts,
    isAccountsLoaded: mocks.isAccountsLoaded,
    invalidateAccountsLoaded: mocks.invalidateAccountsLoaded,
    commitAccounts: mocks.commitAccounts,
    runSerializedAccountWrite: mocks.runSerializedAccountWrite,
    loading: false,
    error: null,
    addNewAccounts: mocks.addNewAccountsMock,
    deleteAccount: mocks.deleteAccountMock,
    batchDeleteAccounts: mocks.batchDeleteAccountsMock,
    editAccount: mocks.editAccountMock,
    togglePinAccount: mocks.togglePinAccountMock,
    batchSetPinned: mocks.batchSetPinnedMock,
    batchMoveToGroup: mocks.batchMoveToGroupMock,
    refreshAccounts: mocks.refreshAccountsMock,
  }),
}));

vi.mock("./hooks/useGroups", () => ({
  useGroups: () => ({
    groups: mocks.groupsState,
    setGroups: mocks.setGroupsStable,
    getLatestGroups: mocks.getLatestGroups,
    isGroupsLoaded: mocks.isGroupsLoaded,
    invalidateGroupsLoaded: mocks.invalidateGroupsLoaded,
    loading: false,
    error: null,
    addGroup: mocks.addGroupMock,
    editGroup: mocks.editGroupMock,
    removeGroup: mocks.removeGroupMock,
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
  default: ({
    collapsed,
    onToggleCollapse,
    onNavigate,
  }: {
    collapsed: boolean;
    onToggleCollapse: () => void;
    onNavigate: (page: "home" | "accounts" | "groups" | "temp" | "sync") => void;
  }) => (
    <div data-testid="sidebar" data-collapsed={String(collapsed)}>
      <span>sidebar</span>
      <button type="button" onClick={onToggleCollapse}>
        toggle-sidebar
      </button>
      <button type="button" onClick={() => onNavigate("accounts")}>
        nav-accounts
      </button>
    </div>
  ),
}));

vi.mock("./components/HomePage", () => ({
  default: ({ onGroupsUpdated }: { onGroupsUpdated: (groups: Group[]) => void }) => (
    <button type="button" onClick={() => onGroupsUpdated(updatedGroups)}>
      trigger-groups-updated
    </button>
  ),
}));

vi.mock("./components/AccountPage", async () => {
  const { memo, useEffect } = await import("react");
  return {
    default: memo((props: Record<string, unknown>) => {
      useEffect(() => {
        mocks.recordAccountPageRender(props);
      });
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
    }),
  };
});

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
    localStorage.clear();
    mocks.accountPageRenderCount = 0;
    mocks.addNewAccountsMock.mockResolvedValue(undefined);
    mocks.batchDeleteAccountsMock.mockResolvedValue(undefined);
    mocks.batchSetPinnedMock.mockResolvedValue(undefined);
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

  it("restores sidebar collapsed state from localStorage and persists toggles across remounts", () => {
    localStorage.setItem("2fa-sidebar-collapsed", "true");

    const { container, unmount } = render(<App />);

    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
    expect(container.querySelector("main")).toHaveClass("ml-16");

    fireEvent.click(screen.getByRole("button", { name: "toggle-sidebar" }));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "false");
    expect(localStorage.getItem("2fa-sidebar-collapsed")).toBe("false");
    expect(container.querySelector("main")).toHaveClass("ml-56");

    fireEvent.click(screen.getByRole("button", { name: "toggle-sidebar" }));
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
    expect(localStorage.getItem("2fa-sidebar-collapsed")).toBe("true");

    unmount();

    render(<App />);
    expect(screen.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
  });

  it("does not re-render AccountPage or animate main margin-left when toggling sidebar", () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "nav-accounts" }));
    const rendersBeforeToggle = mocks.accountPageRenderCount;
    expect(rendersBeforeToggle).toBeGreaterThan(0);

    const main = container.querySelector("main");
    expect(main?.className ?? "").not.toContain("transition-[margin-left]");

    fireEvent.click(screen.getByRole("button", { name: "toggle-sidebar" }));
    expect(mocks.accountPageRenderCount).toBe(rendersBeforeToggle);

    fireEvent.click(screen.getByRole("button", { name: "toggle-sidebar" }));
    expect(mocks.accountPageRenderCount).toBe(rendersBeforeToggle);
  });
});
