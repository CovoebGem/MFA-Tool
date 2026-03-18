import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Group } from "./types";
import App from "./App";

const mocks = vi.hoisted(() => ({
  setGroupsMock: vi.fn(),
  setAccountsMock: vi.fn(),
  addNewAccountsMock: vi.fn().mockResolvedValue(undefined),
  saveGroupsMock: vi.fn().mockResolvedValue(undefined),
  saveAccountsMock: vi.fn().mockResolvedValue(undefined),
}));

const updatedGroups: Group[] = [
  { id: "default", name: "默认", isDefault: true, createdAt: 0 },
  { id: "github", name: "GitHub", isDefault: false, createdAt: 1 },
];

vi.mock("./hooks/useAccounts", () => ({
  useAccounts: () => ({
    accounts: [],
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
    groups: [{ id: "default", name: "默认", isDefault: true, createdAt: 0 }],
    setGroups: mocks.setGroupsMock,
    loading: false,
    error: null,
    addGroup: vi.fn(),
    editGroup: vi.fn(),
    removeGroup: vi.fn(),
  }),
}));

vi.mock("./lib/group-manager", () => ({
  saveGroups: mocks.saveGroupsMock,
}));

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
  default: () => null,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addNewAccountsMock.mockResolvedValue(undefined);
    mocks.saveGroupsMock.mockResolvedValue(undefined);
    mocks.saveAccountsMock.mockResolvedValue(undefined);
  });

  it("persists groups when the home page updates groups after image import", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "trigger-groups-updated" }));

    await waitFor(() => {
      expect(mocks.setGroupsMock).toHaveBeenCalledWith(updatedGroups);
      expect(mocks.saveGroupsMock).toHaveBeenCalledWith(updatedGroups);
    });
  });
});
