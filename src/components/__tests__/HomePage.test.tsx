import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomePage from "../HomePage";
import type { OTPAccount, Group } from "../../types";

const decodedAccount: OTPAccount = {
  id: "acc-1",
  issuer: "GitHub",
  name: "user@example.com",
  secret: "JBSWY3DPEHPK3PXP",
  type: "totp",
  counter: 0,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  createdAt: 1,
  updatedAt: 1,
  groupId: "default",
};

const manualUrlAccount: OTPAccount = {
  id: "manual-url",
  issuer: "Google",
  name: "shaheenavanaerde@gmail.com",
  secret: "RMORR5ZORCUOB4EYCOFDAHK5K2TZ3D7V",
  type: "totp",
  counter: 0,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  createdAt: 2,
  updatedAt: 2,
  groupId: "default",
};

const manualBase32Account: OTPAccount = {
  id: "manual-base32",
  issuer: "GitHub",
  name: "user@example.com",
  secret: "JBSWY3DPEHPK3PXP",
  type: "totp",
  counter: 0,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  createdAt: 3,
  updatedAt: 3,
  groupId: "default",
};

const manualExistingGroupAccount: OTPAccount = {
  ...manualUrlAccount,
  id: "manual-existing-group",
};

const manualEmptyIssuerAccount: OTPAccount = {
  ...manualBase32Account,
  id: "manual-empty-issuer",
  issuer: "",
  name: "orphan@example.com",
};

vi.mock("../ImageUploader", () => ({
  default: ({ onAccountsDecoded }: { onAccountsDecoded: (accounts: OTPAccount[]) => void }) => (
    <button type="button" onClick={() => onAccountsDecoded([decodedAccount])}>
      trigger-image-decode
    </button>
  ),
}));

vi.mock("../ManualAddForm", () => ({
  default: ({ onAccountAdded }: { onAccountAdded: (accounts: OTPAccount[]) => void }) => (
    <>
      <button type="button" onClick={() => onAccountAdded([manualUrlAccount])}>
        trigger-manual-url
      </button>
      <button type="button" onClick={() => onAccountAdded([manualBase32Account])}>
        trigger-manual-base32
      </button>
      <button type="button" onClick={() => onAccountAdded([manualExistingGroupAccount])}>
        trigger-manual-existing-group
      </button>
      <button type="button" onClick={() => onAccountAdded([manualEmptyIssuerAccount])}>
        trigger-manual-empty-issuer
      </button>
    </>
  ),
}));

vi.mock("../Dashboard", () => ({
  default: () => null,
}));

vi.mock("../RecentAccounts", () => ({
  default: () => null,
}));

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a provider group for image import when issuer exists", async () => {
    const onAccountsAdded = vi.fn().mockResolvedValue(undefined);
    const onGroupsUpdated = vi.fn().mockResolvedValue(undefined);
    const onDedupDetected = vi.fn();
    const onToast = vi.fn();
    const groups: Group[] = [{ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }];

    render(
      <HomePage
        accounts={[]}
        groups={groups}
        onAccountsAdded={onAccountsAdded}
        onGroupsUpdated={onGroupsUpdated}
        onDedupDetected={onDedupDetected}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "trigger-image-decode" }));

    expect(onDedupDetected).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(onGroupsUpdated).toHaveBeenCalledTimes(1);
      expect(onAccountsAdded).toHaveBeenCalledTimes(1);
    });

    const updatedGroups = onGroupsUpdated.mock.calls[0][0] as Group[];
    const createdGroup = updatedGroups.find((group) => group.name === "GitHub");

    expect(createdGroup).toBeTruthy();
    expect(onAccountsAdded).toHaveBeenCalledWith([
      expect.objectContaining({ issuer: "GitHub", name: "user@example.com", groupId: createdGroup?.id }),
    ]);
  });

  it("creates a provider group for otpauth URL imports", async () => {
    const onAccountsAdded = vi.fn().mockResolvedValue(undefined);
    const onGroupsUpdated = vi.fn().mockResolvedValue(undefined);
    const onDedupDetected = vi.fn();
    const onToast = vi.fn();
    const groups: Group[] = [{ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }];

    render(
      <HomePage
        accounts={[]}
        groups={groups}
        onAccountsAdded={onAccountsAdded}
        onGroupsUpdated={onGroupsUpdated}
        onDedupDetected={onDedupDetected}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "trigger-manual-url" }));

    await waitFor(() => {
      expect(onGroupsUpdated).toHaveBeenCalledTimes(1);
      expect(onAccountsAdded).toHaveBeenCalledTimes(1);
    });

    const updatedGroups = onGroupsUpdated.mock.calls[0][0] as Group[];
    const createdGroup = updatedGroups.find((group) => group.name === "Google");

    expect(createdGroup).toBeTruthy();
    expect(onAccountsAdded).toHaveBeenCalledWith([
      expect.objectContaining({ issuer: "Google", groupId: createdGroup?.id }),
    ]);
    expect(onDedupDetected).not.toHaveBeenCalled();
  });

  it("creates a provider group for manual Base32 imports", async () => {
    const onAccountsAdded = vi.fn().mockResolvedValue(undefined);
    const onGroupsUpdated = vi.fn().mockResolvedValue(undefined);
    const onDedupDetected = vi.fn();
    const onToast = vi.fn();
    const groups: Group[] = [{ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }];

    render(
      <HomePage
        accounts={[]}
        groups={groups}
        onAccountsAdded={onAccountsAdded}
        onGroupsUpdated={onGroupsUpdated}
        onDedupDetected={onDedupDetected}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "trigger-manual-base32" }));

    await waitFor(() => {
      expect(onGroupsUpdated).toHaveBeenCalledTimes(1);
      expect(onAccountsAdded).toHaveBeenCalledTimes(1);
    });

    const updatedGroups = onGroupsUpdated.mock.calls[0][0] as Group[];
    const createdGroup = updatedGroups.find((group) => group.name === "GitHub");

    expect(createdGroup).toBeTruthy();
    expect(onAccountsAdded).toHaveBeenCalledWith([
      expect.objectContaining({ issuer: "GitHub", groupId: createdGroup?.id }),
    ]);
    expect(onDedupDetected).not.toHaveBeenCalled();
  });

  it("reuses an existing provider group for manual imports", async () => {
    const onAccountsAdded = vi.fn().mockResolvedValue(undefined);
    const onGroupsUpdated = vi.fn().mockResolvedValue(undefined);
    const onDedupDetected = vi.fn();
    const onToast = vi.fn();
    const groups: Group[] = [
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "google-group", name: "Google", isDefault: false, createdAt: 1, updatedAt: 1 },
    ];

    render(
      <HomePage
        accounts={[]}
        groups={groups}
        onAccountsAdded={onAccountsAdded}
        onGroupsUpdated={onGroupsUpdated}
        onDedupDetected={onDedupDetected}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "trigger-manual-existing-group" }));

    await waitFor(() => {
      expect(onAccountsAdded).toHaveBeenCalledTimes(1);
    });

    expect(onGroupsUpdated).not.toHaveBeenCalled();
    expect(onAccountsAdded).toHaveBeenCalledWith([
      expect.objectContaining({ issuer: "Google", groupId: "google-group" }),
    ]);
    expect(onDedupDetected).not.toHaveBeenCalled();
  });

  it("keeps accounts without issuer in the default group", async () => {
    const onAccountsAdded = vi.fn().mockResolvedValue(undefined);
    const onGroupsUpdated = vi.fn().mockResolvedValue(undefined);
    const onDedupDetected = vi.fn();
    const onToast = vi.fn();
    const groups: Group[] = [{ id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 }];

    render(
      <HomePage
        accounts={[]}
        groups={groups}
        onAccountsAdded={onAccountsAdded}
        onGroupsUpdated={onGroupsUpdated}
        onDedupDetected={onDedupDetected}
        onToast={onToast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "trigger-manual-empty-issuer" }));

    await waitFor(() => {
      expect(onAccountsAdded).toHaveBeenCalledTimes(1);
    });

    expect(onGroupsUpdated).not.toHaveBeenCalled();
    expect(onAccountsAdded).toHaveBeenCalledWith([
      expect.objectContaining({ issuer: "", groupId: "default" }),
    ]);
    expect(onDedupDetected).not.toHaveBeenCalled();
  });
});
