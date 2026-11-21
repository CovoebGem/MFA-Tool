import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGroups } from "./useGroups";

const mocks = vi.hoisted(() => ({
  loadGroups: vi.fn(),
  saveGroups: vi.fn(),
}));

vi.mock("../lib/group-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/group-manager")>();
  return {
    ...actual,
    loadGroups: mocks.loadGroups,
    saveGroups: mocks.saveGroups,
  };
});

describe("useGroups load gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveGroups.mockResolvedValue(undefined);
  });

  it("blocks addGroup when initial loadGroups fails and never overwrites groups.json", async () => {
    mocks.loadGroups.mockRejectedValueOnce(new Error("read groups failed"));

    const { result } = renderHook(() => useGroups());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("read groups failed");
    expect(result.current.isGroupsLoaded()).toBe(false);

    await act(async () => {
      await expect(result.current.addGroup("Work")).rejects.toThrow("分组尚未加载成功");
    });

    expect(mocks.saveGroups).not.toHaveBeenCalled();
  });
});
