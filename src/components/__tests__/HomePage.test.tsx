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
  groupId: "default",
};

vi.mock("../ImageUploader", () => ({
  default: ({ onAccountsDecoded }: { onAccountsDecoded: (accounts: OTPAccount[]) => void }) => (
    <button type="button" onClick={() => onAccountsDecoded([decodedAccount])}>
      trigger-image-decode
    </button>
  ),
}));

vi.mock("../ManualAddForm", () => ({
  default: () => null,
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

  it("creates a provider group from the account name when issuer is empty", async () => {
    const onAccountsAdded = vi.fn().mockResolvedValue(undefined);
    const onGroupsUpdated = vi.fn().mockResolvedValue(undefined);
    const onDedupDetected = vi.fn();
    const onToast = vi.fn();
    const groups: Group[] = [{ id: "default", name: "默认", isDefault: true, createdAt: 0 }];

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
});
