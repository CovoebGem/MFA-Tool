import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAccounts } from "./useAccounts";
import type { OTPAccount } from "../types";

const mocks = vi.hoisted(() => ({
  loadAccounts: vi.fn(),
  saveAccounts: vi.fn(),
}));

vi.mock("../lib/account-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/account-manager")>();
  return {
    ...actual,
    loadAccounts: mocks.loadAccounts,
    saveAccounts: mocks.saveAccounts,
  };
});

function makeAccount(id: string): OTPAccount {
  return {
    id,
    issuer: "GitHub",
    name: `${id}@example.com`,
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
}

describe("useAccounts batch operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAccounts.mockResolvedValue([
      makeAccount("a1"),
      makeAccount("a2"),
      makeAccount("a3"),
      makeAccount("a4"),
    ]);
    mocks.saveAccounts.mockResolvedValue(undefined);
  });

  it("batchDeleteAccounts removes all selected accounts in a single save", async () => {
    const { result } = renderHook(() => useAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.batchDeleteAccounts(["a1", "a3"]);
    });

    expect(mocks.saveAccounts).toHaveBeenCalledTimes(1);
    expect(mocks.saveAccounts.mock.calls[0][0].map((a: OTPAccount) => a.id)).toEqual(["a2", "a4"]);
    expect(result.current.accounts.map((a) => a.id)).toEqual(["a2", "a4"]);
  });

  it("batchDeleteAccounts keeps state unchanged and rethrows when saveAccounts fails", async () => {
    mocks.saveAccounts.mockRejectedValueOnce(new Error("disk error"));
    const { result } = renderHook(() => useAccounts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await expect(
        result.current.batchDeleteAccounts(["a1", "a3"]),
      ).rejects.toThrow("disk error");
    });

    expect(result.current.accounts.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(result.current.error).toBe("disk error");
  });

  it("serializes concurrent batchDelete then batchMove so neither overwrites the other", async () => {
    const saveResolvers: Array<() => void> = [];
    mocks.saveAccounts.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          saveResolvers.push(resolve);
        }),
    );

    const { result } = renderHook(() => useAccounts());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let deletePromise!: Promise<void>;
    let movePromise!: Promise<void>;

    await act(async () => {
      deletePromise = result.current.batchDeleteAccounts(["a1"]);
      movePromise = result.current.batchMoveToGroup(["a2", "a3"], "work");
      await Promise.resolve();
    });

    // 第二次保存应排队等待第一次保存完成
    expect(mocks.saveAccounts).toHaveBeenCalledTimes(1);
    expect(mocks.saveAccounts.mock.calls[0][0].map((a: OTPAccount) => a.id)).toEqual(["a2", "a3", "a4"]);

    await act(async () => {
      saveResolvers[0]();
      await deletePromise;
    });

    await waitFor(() => {
      expect(mocks.saveAccounts).toHaveBeenCalledTimes(2);
    });
    const secondSaved = mocks.saveAccounts.mock.calls[1][0] as OTPAccount[];
    expect(secondSaved.map((a) => a.id)).toEqual(["a2", "a3", "a4"]);
    expect(secondSaved.filter((a) => a.groupId === "work").map((a) => a.id)).toEqual(["a2", "a3"]);

    await act(async () => {
      saveResolvers[1]();
      await movePromise;
    });

    expect(result.current.accounts.map((a) => a.id)).toEqual(["a2", "a3", "a4"]);
    expect(result.current.accounts.filter((a) => a.groupId === "work").map((a) => a.id)).toEqual([
      "a2",
      "a3",
    ]);
  });

  it("serializes concurrent batchMove then batchDelete without restoring deleted item", async () => {
    const saveResolvers: Array<() => void> = [];
    mocks.saveAccounts.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          saveResolvers.push(resolve);
        }),
    );

    const { result } = renderHook(() => useAccounts());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let movePromise!: Promise<void>;
    let deletePromise!: Promise<void>;

    await act(async () => {
      movePromise = result.current.batchMoveToGroup(["a2"], "work");
      deletePromise = result.current.batchDeleteAccounts(["a1"]);
      await Promise.resolve();
    });

    expect(mocks.saveAccounts).toHaveBeenCalledTimes(1);

    await act(async () => {
      saveResolvers[0]();
      await movePromise;
    });

    await waitFor(() => {
      expect(mocks.saveAccounts).toHaveBeenCalledTimes(2);
    });
    const secondSaved = mocks.saveAccounts.mock.calls[1][0] as OTPAccount[];
    expect(secondSaved.map((a) => a.id)).toEqual(["a2", "a3", "a4"]);
    expect(secondSaved.find((a) => a.id === "a2")?.groupId).toBe("work");

    await act(async () => {
      saveResolvers[1]();
      await deletePromise;
    });

    expect(result.current.accounts.map((a) => a.id)).toEqual(["a2", "a3", "a4"]);
    expect(result.current.accounts.find((a) => a.id === "a2")?.groupId).toBe("work");
  });

  it("normalizes corrupted period, digits, and counter when loading accounts", async () => {
    mocks.loadAccounts.mockResolvedValueOnce([
      { ...makeAccount("bad"), period: 1e308, digits: 0, counter: -1 },
    ]);

    const { result } = renderHook(() => useAccounts());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.accounts[0]).toMatchObject({
      id: "bad",
      period: 30,
      digits: 6,
      counter: 0,
    });
    expect(mocks.saveAccounts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "bad",
        period: 30,
        digits: 6,
        counter: 0,
      }),
    ]);
  });

  it("keeps loaded snapshot in memory if startup migration write fails, so later add preserves old accounts", async () => {
    const legacyAccount = {
      ...makeAccount("old"),
      updatedAt: undefined,
    } as unknown as OTPAccount;
    const newAccount = makeAccount("new");
    mocks.loadAccounts.mockResolvedValueOnce([legacyAccount]);
    mocks.saveAccounts
      .mockRejectedValueOnce(new Error("migration write failed"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAccounts());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("migration write failed");
    expect(result.current.isAccountsLoaded()).toBe(true);
    expect(result.current.accounts.map((a) => a.id)).toEqual(["old"]);

    await act(async () => {
      await result.current.addNewAccounts([newAccount]);
    });

    expect(mocks.saveAccounts).toHaveBeenCalledTimes(2);
    expect((mocks.saveAccounts.mock.calls[1][0] as OTPAccount[]).map((a) => a.id)).toEqual([
      "old",
      "new",
    ]);
    expect(result.current.accounts.map((a) => a.id)).toEqual(["old", "new"]);
  });

  it("blocks writes when initial loadAccounts fails", async () => {
    mocks.loadAccounts.mockRejectedValueOnce(new Error("read failed"));

    const { result } = renderHook(() => useAccounts());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("read failed");
    expect(result.current.isAccountsLoaded()).toBe(false);

    await act(async () => {
      await expect(result.current.addNewAccounts([makeAccount("new")])).rejects.toThrow(
        "账户库尚未加载成功",
      );
    });

    expect(mocks.saveAccounts).not.toHaveBeenCalled();
  });
});
