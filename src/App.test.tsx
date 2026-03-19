import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Group, OTPAccount } from "./types";
import App from "./App";

const mocks = vi.hoisted(() => ({
  setGroupsMock: vi.fn(),
  setAccountsMock: vi.fn(),
  addNewAccountsMock: vi.fn().mockResolvedValue(undefined),
  saveGroupsMock: vi.fn().mockResolvedValue(undefined),
  saveAccountsMock: vi.fn().mockResolvedValue(undefined),
  accountsState: [] as OTPAccount[],
  groupsState: [] as Group[],
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
  useAccounts: () => ({
    accounts: mocks.accountsState,
    setAccounts: mocks.setAccountsMock,
    loading: false,
    error: null,
    addNewAccounts: mocks.addNewAccountsMock,
    deleteAccount: vi.fn(),
    editAccount: vi.fn(),
    batchMoveToGroup: vi.fn(),
    refreshAccounts: vi.fn(),
  }),
}));

vi.mock("./hooks/useGroups", () => ({
  useGroups: () => ({
    groups: mocks.groupsState,
    setGroups: mocks.setGroupsMock,
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

vi.mock("./lib/account-manager", () => ({
  saveAccounts: mocks.saveAccountsMock,
}));

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
  default: () => null,
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
  default: ({ onImport }: { onImport: (accounts: OTPAccount[], groups: Group[]) => void }) => (
    <button type="button" onClick={() => onImport(importedAccounts, importedGroups)}>
      trigger-backup-import
    </button>
  ),
}));

vi.mock("./components/WebDavSyncPanel", () => ({
  default: () => null,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addNewAccountsMock.mockResolvedValue(undefined);
    mocks.saveGroupsMock.mockResolvedValue(undefined);
    mocks.saveAccountsMock.mockResolvedValue(undefined);
    mocks.accountsState = [];
    mocks.groupsState = [{ id: "default", name: "默认", isDefault: true, createdAt: 0 }];
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

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "trigger-backup-import" }));

    await waitFor(() => {
      expect(mocks.setAccountsMock).toHaveBeenCalledWith([
        mocks.accountsState[0],
        expect.objectContaining({
          id: "imported-unique",
          issuer: "Google",
          groupId: "google-imported",
          order: 1,
        }),
      ]);
      expect(mocks.setGroupsMock).toHaveBeenCalledWith([
        mocks.groupsState[0],
        importedGroups[1],
      ]);
      expect(mocks.saveAccountsMock).toHaveBeenCalledWith([
        mocks.accountsState[0],
        expect.objectContaining({
          id: "imported-unique",
          issuer: "Google",
          groupId: "google-imported",
          order: 1,
        }),
      ]);
      expect(mocks.saveGroupsMock).toHaveBeenCalledWith([
        mocks.groupsState[0],
        importedGroups[1],
      ]);
    });
  });
});
