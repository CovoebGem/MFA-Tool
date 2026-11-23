import { describe, it, expect } from "vitest";
import {
  sortAccounts,
  resolveSameSectionDraggedIds,
  collapseDraggedAccountGroup,
  expandDraggedAccountGroup,
} from "./sorter";
import type { OTPAccount } from "../types";

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: crypto.randomUUID(),
    issuer: "Default",
    name: "user@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: Date.now(),
    groupId: "default",
    ...overrides,
  };
}

describe("sortAccounts", () => {
  it("应返回新数组，不修改原数组", () => {
    const accounts = [makeAccount({ name: "B" }), makeAccount({ name: "A" })];
    const original = [...accounts];
    const result = sortAccounts(accounts, { field: "name", direction: "asc" });

    expect(result).not.toBe(accounts);
    expect(accounts).toEqual(original);
  });

  it("空列表排序返回空数组", () => {
    const result = sortAccounts([], { field: "name", direction: "asc" });
    expect(result).toEqual([]);
  });

  it("单元素列表排序返回相同元素", () => {
    const account = makeAccount({ name: "Solo" });
    const result = sortAccounts([account], { field: "name", direction: "asc" });
    expect(result).toEqual([account]);
  });

  it("按 name 升序排序", () => {
    const a = makeAccount({ name: "Alice" });
    const b = makeAccount({ name: "Bob" });
    const c = makeAccount({ name: "Charlie" });
    const result = sortAccounts([c, a, b], { field: "name", direction: "asc" });
    expect(result.map((x) => x.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("按 name 降序排序", () => {
    const a = makeAccount({ name: "Alice" });
    const b = makeAccount({ name: "Bob" });
    const c = makeAccount({ name: "Charlie" });
    const result = sortAccounts([a, b, c], {
      field: "name",
      direction: "desc",
    });
    expect(result.map((x) => x.name)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("按 issuer 升序排序", () => {
    const g = makeAccount({ issuer: "Google" });
    const a = makeAccount({ issuer: "Apple" });
    const m = makeAccount({ issuer: "Microsoft" });
    const result = sortAccounts([g, a, m], {
      field: "issuer",
      direction: "asc",
    });
    expect(result.map((x) => x.issuer)).toEqual([
      "Apple",
      "Google",
      "Microsoft",
    ]);
  });

  it("按 createdAt 升序排序", () => {
    const old = makeAccount({ createdAt: 1000 });
    const mid = makeAccount({ createdAt: 2000 });
    const recent = makeAccount({ createdAt: 3000 });
    const result = sortAccounts([recent, old, mid], {
      field: "createdAt",
      direction: "asc",
    });
    expect(result.map((x) => x.createdAt)).toEqual([1000, 2000, 3000]);
  });

  it("按 createdAt 降序排序", () => {
    const old = makeAccount({ createdAt: 1000 });
    const mid = makeAccount({ createdAt: 2000 });
    const recent = makeAccount({ createdAt: 3000 });
    const result = sortAccounts([old, mid, recent], {
      field: "createdAt",
      direction: "desc",
    });
    expect(result.map((x) => x.createdAt)).toEqual([3000, 2000, 1000]);
  });

  it("置顶账户在所有字段与升降序及自定义排序中始终排在未置顶账户前面", () => {
    const a = makeAccount({ id: "a", name: "Alice", issuer: "Apple", createdAt: 1000, order: 0, pinned: false });
    const b = makeAccount({ id: "b", name: "Zoe", issuer: "Zeta", createdAt: 2000, order: 2, pinned: true, pinnedAt: 900 });
    const c = makeAccount({ id: "c", name: "Bob", issuer: "GitHub", createdAt: 3000, order: 1, pinned: true, pinnedAt: 1200 });

    const byNameAsc = sortAccounts([a, b, c], { field: "name", direction: "asc" });
    expect(byNameAsc.map((x) => x.id)).toEqual(["c", "b", "a"]);

    const byNameDesc = sortAccounts([a, b, c], { field: "name", direction: "desc" });
    expect(byNameDesc.map((x) => x.id)).toEqual(["b", "c", "a"]);

    const byCreatedAsc = sortAccounts([a, b, c], { field: "createdAt", direction: "asc" });
    expect(byCreatedAsc.map((x) => x.id)).toEqual(["b", "c", "a"]);

    const customMode = sortAccounts([a, b, c], { field: "name", direction: "asc" }, "custom");
    expect(customMode.map((x) => x.id)).toEqual(["c", "b", "a"]);

    // 同字段值时，最近置顶的排前面
    const tie1 = makeAccount({ id: "t1", name: "Same", createdAt: 1000, pinned: true, pinnedAt: 100 });
    const tie2 = makeAccount({ id: "t2", name: "Same", createdAt: 1000, pinned: true, pinnedAt: 200 });
    expect(sortAccounts([tie1, tie2], { field: "name", direction: "asc" }).map((x) => x.id)).toEqual(["t2", "t1"]);

    // 取消置顶后恢复原排序位置
    const unpinnedB = { ...b, pinned: false, pinnedAt: undefined };
    expect(sortAccounts([a, unpinnedB, c], { field: "name", direction: "asc" }).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("custom 模式下无 order 的账户按 sortConfig 回退排序，有 order 的账户排在前面", () => {
    const z = makeAccount({ id: "z", name: "Zoe", issuer: "Zeta", createdAt: 100 });
    const a = makeAccount({ id: "a", name: "Alice", issuer: "Apple", createdAt: 300 });
    const m = makeAccount({ id: "m", name: "Mia", issuer: "Meta", createdAt: 200 });

    // 全部缺少 order 时，切入 custom 模式应保持与当前 sortConfig 一致，避免顺序跳变
    expect(
      sortAccounts([z, a, m], { field: "name", direction: "asc" }, "custom").map((x) => x.id),
    ).toEqual(["a", "m", "z"]);

    expect(
      sortAccounts([z, a, m], { field: "createdAt", direction: "desc" }, "custom").map((x) => x.id),
    ).toEqual(["a", "m", "z"]);

    // 已有 order 的账户严格按 order 排在未设置 order 的账户之前
    const orderedZ = { ...z, order: 0 };
    expect(
      sortAccounts([m, a, orderedZ], { field: "name", direction: "asc" }, "custom").map((x) => x.id),
    ).toEqual(["z", "a", "m"]);
  });
});

describe("multi-select drag helpers", () => {
  it("resolveSameSectionDraggedIds 仅在锚点被选中时聚合同一置顶分区的已选账户", () => {
    const p1 = makeAccount({ id: "p1", pinned: true });
    const p2 = makeAccount({ id: "p2", pinned: true });
    const u1 = makeAccount({ id: "u1", pinned: false });
    const u2 = makeAccount({ id: "u2", pinned: false });
    const all = [p1, p2, u1, u2];

    expect(resolveSameSectionDraggedIds(all, "u1", undefined)).toEqual(new Set(["u1"]));
    expect(resolveSameSectionDraggedIds(all, "u1", new Set())).toEqual(new Set(["u1"]));
    // 锚点未在选中集合中：仅拖拽锚点自身
    expect(resolveSameSectionDraggedIds(all, "u1", new Set(["p1", "u2"]))).toEqual(new Set(["u1"]));
    // 混合勾选置顶与未置顶：只聚合与锚点同分区的项
    expect(resolveSameSectionDraggedIds(all, "u1", new Set(["p1", "u1", "u2"]))).toEqual(
      new Set(["u1", "u2"]),
    );
    expect(resolveSameSectionDraggedIds(all, "p2", new Set(["p1", "p2", "u1"]))).toEqual(
      new Set(["p1", "p2"]),
    );
    // 锚点缺失时的防御回退
    expect(resolveSameSectionDraggedIds(all, "missing", new Set(["missing", "u1"]))).toEqual(
      new Set(["missing"]),
    );
  });

  it("collapseDraggedAccountGroup 与 expandDraggedAccountGroup 保持原相对顺序并在原地展开重编号", () => {
    const a1 = makeAccount({ id: "a1", order: 0 });
    const a2 = makeAccount({ id: "a2", order: 1 });
    const a3 = makeAccount({ id: "a3", order: 2 });
    const a4 = makeAccount({ id: "a4", order: 3 });
    const accounts = [a1, a2, a3, a4];

    // 非连续多选 [a3, a1]（Set 逆序插入），拖动锚点 a3
    const draggedSet = new Set(["a3", "a1"]);
    const { collapsed, draggedAccounts, anchorIndex } = collapseDraggedAccountGroup(
      accounts,
      "a3",
      draggedSet,
    );

    expect(draggedAccounts.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(collapsed.map((a) => a.id)).toEqual(["a2", "a3", "a4"]);
    expect(anchorIndex).toBe(1);

    // 模拟将锚点 a3 拖到 a2 之前 -> [a3, a2, a4]，松手展开应还原 a1 在 a3 前的相对顺序
    const expanded = expandDraggedAccountGroup([a3, a2, a4], "a3", draggedAccounts);
    expect(expanded.map((a) => a.id)).toEqual(["a1", "a3", "a2", "a4"]);
    expect(expanded.map((a) => a.order)).toEqual([0, 1, 2, 3]);

    // 锚点找不到时仍防御性重编号
    const fallbackExpanded = expandDraggedAccountGroup([a2, a4], "missing", draggedAccounts);
    expect(fallbackExpanded.map((a) => a.id)).toEqual(["a2", "a4"]);
    expect(fallbackExpanded.map((a) => a.order)).toEqual([0, 1]);
  });
});
