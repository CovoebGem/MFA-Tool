import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import DraggableAccountList from "../DraggableAccountList";
import type { Group, OTPAccount } from "../../types";

vi.mock("../../hooks/useTOTP", () => ({
  useTOTP: () => ({ code: "123456", remaining: 25 }),
}));

const mockGroups: Group[] = [
  { id: "default", name: "默认分组", isDefault: true, createdAt: 0 },
];

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: overrides.id ?? "acc-1",
    issuer: overrides.issuer ?? "Service",
    name: overrides.name ?? "user@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: 1000,
    groupId: "default",
    ...overrides,
  };
}

function makeDOMRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function installDynamicRects(
  container: HTMLElement,
  mode: "grid" | "list" = "grid",
) {
  const items = Array.from(container.querySelectorAll<HTMLElement>("[data-sortable-id]"));
  for (const el of items) {
    el.getBoundingClientRect = () => {
      const section = el.closest<HTMLElement>("[data-sortable-section]");
      const sectionType = section?.dataset.sortableSection;
      const scope = section ?? container;
      const siblings = Array.from(scope.querySelectorAll<HTMLElement>("[data-sortable-id]"));
      const idx = siblings.indexOf(el);
      if (idx === -1) {
        return makeDOMRect(0, 0, 0, 0);
      }

      if (mode === "list") {
        const baseTop = sectionType === "other" ? 400 : 100;
        return makeDOMRect(20, baseTop + idx * 60, 700, 56);
      }

      const baseTop = sectionType === "other" ? 300 : 100;
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      return makeDOMRect(20 + col * 280, baseTop + row * 160, 260, 140);
    };
  }
}

function getCard(issuer: string): HTMLElement {
  return screen.getByText(issuer).closest('[data-slot="card"]') as HTMLElement;
}

function getRow(issuer: string): HTMLElement {
  return screen.getByText(issuer).closest('[data-slot="account-row"]') as HTMLElement;
}

describe("DraggableAccountList", () => {
  const sampleAccounts: OTPAccount[] = [
    makeAccount({ id: "a1", issuer: "Alpha", name: "a@test.com", order: 0 }),
    makeAccount({ id: "a2", issuer: "Beta", name: "b@test.com", order: 1 }),
    makeAccount({ id: "a3", issuer: "Gamma", name: "c@test.com", order: 2 }),
  ];

  let animateSpy: ReturnType<typeof vi.fn>;
  let originalAnimate: typeof Element.prototype.animate | undefined;
  let originalMatchMedia: typeof window.matchMedia | undefined;

  const setReducedMotion = (matches: boolean) => {
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
      configurable: true,
      writable: true,
    });
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    originalAnimate = Element.prototype.animate;
    originalMatchMedia = window.matchMedia;
    animateSpy = vi.fn(() => {
      const anim = {
        cancel: vi.fn(),
        finish: vi.fn(),
        onfinish: null as null | ((ev: AnimationPlaybackEvent) => void),
        oncancel: null as null | ((ev: AnimationPlaybackEvent) => void),
      };
      return anim as unknown as Animation;
    });
    Element.prototype.animate = animateSpy as unknown as typeof Element.prototype.animate;
    setReducedMotion(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  });

  afterEach(() => {
    if (originalAnimate) {
      Element.prototype.animate = originalAnimate;
    } else {
      // @ts-expect-error restore missing jsdom animate
      delete Element.prototype.animate;
    }
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        value: originalMatchMedia,
        configurable: true,
        writable: true,
      });
    }
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  });

  it("网格视图向后拖拽（0 -> 2）显示悬浮克隆层、占位槽与 WAAPI FLIP 动画，并在松手时提交新顺序", () => {
    const onReorder = vi.fn();
    const { container } = render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );
    installDynamicRects(container, "grid");

    const cardA = getCard("Alpha");
    fireEvent.pointerDown(cardA, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    // 超过阈值并拖到 Gamma (slot 2: 580..840) 上
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 700, clientY: 160 });

    const overlay = document.querySelector('[data-slot="drag-overlay"]') as HTMLElement;
    expect(overlay).toBeInTheDocument();
    expect(overlay.getAttribute("data-drag-forbidden")).toBe("false");
    expect(cardA).toHaveAttribute("data-drag-placeholder", "true");

    // 邻居 Beta 和 Gamma 应触发 FLIP translate3d 动画，且使用 cubic-bezier(0.23, 1, 0.32, 1)
    expect(animateSpy).toHaveBeenCalled();
    const firstCallArgs = animateSpy.mock.calls[0];
    expect(firstCallArgs[0][0].transform).toContain("translate3d(");
    expect(firstCallArgs[1]).toEqual({
      duration: 220,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });

    const settleCallsBeforeUp = animateSpy.mock.calls.length;
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 700, clientY: 160 });
    expect(onReorder).toHaveBeenCalledTimes(1);
    const reordered = onReorder.mock.calls[0][0] as OTPAccount[];
    expect(reordered.map((a) => a.id)).toEqual(["a2", "a3", "a1"]);
    expect(reordered.map((a) => a.order)).toEqual([0, 1, 2]);

    // 验证 180ms 归位动画执行并在完成后清除悬浮克隆层与占位槽
    expect(animateSpy.mock.calls.length).toBeGreaterThan(settleCallsBeforeUp);
    const settleCallIndex = animateSpy.mock.calls.length - 1;
    expect(animateSpy.mock.calls[settleCallIndex][1]).toMatchObject({
      duration: 180,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      fill: "forwards",
    });
    const settleAnim = animateSpy.mock.results[settleCallIndex].value as {
      onfinish: ((ev: AnimationPlaybackEvent) => void) | null;
    };
    act(() => {
      settleAnim.onfinish?.(new Event("finish") as AnimationPlaybackEvent);
    });
    expect(document.querySelector('[data-slot="drag-overlay"]')).not.toBeInTheDocument();
    expect(cardA).not.toHaveAttribute("data-drag-placeholder");
  });

  it("网格视图向前拖拽（2 -> 0）正确重排并执行 FLIP 动画", () => {
    const onReorder = vi.fn();
    const { container } = render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );
    installDynamicRects(container, "grid");

    const cardC = getCard("Gamma");
    fireEvent.pointerDown(cardC, { button: 0, pointerId: 1, clientX: 700, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 160 });

    expect(animateSpy).toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 120, clientY: 160 });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect((onReorder.mock.calls[0][0] as OTPAccount[]).map((a) => a.id)).toEqual([
      "a3",
      "a1",
      "a2",
    ]);
  });

  it("列表视图拖拽（0 -> 2）实时换位并在松手时重排", () => {
    const onReorder = vi.fn();
    const { container } = render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        viewMode="list"
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );
    installDynamicRects(container, "list");

    const rowA = getRow("Alpha");
    fireEvent.pointerDown(rowA, { button: 0, pointerId: 1, clientX: 120, clientY: 120 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 255 });

    expect(document.querySelector('[data-slot="drag-overlay"]')).toBeInTheDocument();
    expect(rowA).toHaveAttribute("data-drag-placeholder", "true");
    expect(animateSpy).toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 120, clientY: 255 });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect((onReorder.mock.calls[0][0] as OTPAccount[]).map((a) => a.id)).toEqual([
      "a2",
      "a3",
      "a1",
    ]);
  });

  it("移动不足 5px 阈值不进入拖拽态；点击复选框与按钮不触发拖拽", () => {
    const onReorder = vi.fn();
    const onToggleSelect = vi.fn();
    const { container } = render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );
    installDynamicRects(container, "grid");

    const cardA = getCard("Alpha");
    // 移动仅 3px -> 不触发拖拽
    fireEvent.pointerDown(cardA, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 102, clientY: 162 });
    expect(document.querySelector('[data-slot="drag-overlay"]')).not.toBeInTheDocument();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 102, clientY: 162 });
    expect(onReorder).not.toHaveBeenCalled();

    // 按在复选框或操作按钮上拖动 -> 不触发拖拽，复选框正常勾选
    const checkboxA = screen.getByLabelText("选择账户 Alpha");
    fireEvent.pointerDown(checkboxA, { button: 0, pointerId: 2, clientX: 40, clientY: 120 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 700, clientY: 160 });
    expect(document.querySelector('[data-slot="drag-overlay"]')).not.toBeInTheDocument();
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 700, clientY: 160 });
    fireEvent.click(checkboxA);
    expect(onToggleSelect).toHaveBeenCalledWith("a1");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("按 Escape 取消拖拽会恢复原顺序、清除浮起层并阻止调用 onReorder", () => {
    const onReorder = vi.fn();
    const { container } = render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );
    installDynamicRects(container, "grid");

    const cardA = getCard("Alpha");
    fireEvent.pointerDown(cardA, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 700, clientY: 160 });
    expect(document.querySelector('[data-slot="drag-overlay"]')).toBeInTheDocument();

    // 实时预览顺序已变为 Beta, Gamma, Alpha
    const movedTitles = Array.from(container.querySelectorAll('[data-slot="card"] h3')).map(
      (el) => el.textContent,
    );
    expect(movedTitles).toEqual(["Beta", "Gamma", "Alpha"]);

    // 按 Esc 取消 -> 恢复 Alpha, Beta, Gamma 且移除浮起层与占位态
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(document.querySelector('[data-slot="drag-overlay"]')).not.toBeInTheDocument();
    expect(cardA).not.toHaveAttribute("data-drag-placeholder");
    const restoredTitles = Array.from(container.querySelectorAll('[data-slot="card"] h3')).map(
      (el) => el.textContent,
    );
    expect(restoredTitles).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("拖出后返回原位松手不触发 onReorder", () => {
    const onReorder = vi.fn();
    const { container } = render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );
    installDynamicRects(container, "grid");

    const cardA = getCard("Alpha");
    fireEvent.pointerDown(cardA, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    // 移到 Beta 上交换为 [Beta, Alpha, Gamma]
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 430, clientY: 160 });
    // 移回 slot 0（此时是 Beta 的位置）换回 [Alpha, Beta, Gamma]
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 160 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 160 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("跨置顶分区拖拽显示禁止反馈并在松手时恢复原顺序、不调用 onReorder", () => {
    const onReorder = vi.fn();
    const pinnedAndOther: OTPAccount[] = [
      makeAccount({ id: "p1", issuer: "PinOne", pinned: true, pinnedAt: 2000, order: 0 }),
      makeAccount({ id: "p2", issuer: "PinTwo", pinned: true, pinnedAt: 1000, order: 1 }),
      makeAccount({ id: "u1", issuer: "NormalOne", pinned: false, order: 2 }),
    ];

    const { container } = render(
      <DraggableAccountList
        accounts={pinnedAndOther}
        groups={mockGroups}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );
    installDynamicRects(container, "grid");

    const cardP1 = getCard("PinOne");
    fireEvent.pointerDown(cardP1, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    // 先拖到同分区 PinTwo 上 -> 允许
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 430, clientY: 160 });
    const overlay = document.querySelector('[data-slot="drag-overlay"]') as HTMLElement;
    expect(overlay.getAttribute("data-drag-forbidden")).toBe("false");

    // 拖入未置顶区 NormalOne (top=300..440) -> 禁止状态
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 360 });
    expect(overlay.getAttribute("data-drag-forbidden")).toBe("true");
    expect(document.body.style.cursor).toBe("not-allowed");

    // 在禁止区松手 -> 取消本次重排并恢复原顺序
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 360 });
    expect(onReorder).not.toHaveBeenCalled();
    const restoredTitles = Array.from(container.querySelectorAll('[data-slot="card"] h3')).map(
      (el) => el.textContent,
    );
    expect(restoredTitles).toEqual(["PinOne", "PinTwo", "NormalOne"]);
  });

  it("prefers-reduced-motion: reduce 生效时跳过 FLIP 与归位动画但仍正常完成重排", () => {
    setReducedMotion(true);
    const onReorder = vi.fn();
    const { container } = render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );
    installDynamicRects(container, "grid");

    const cardA = getCard("Alpha");
    fireEvent.pointerDown(cardA, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 700, clientY: 160 });
    expect(animateSpy).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 700, clientY: 160 });
    expect(animateSpy).not.toHaveBeenCalled();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect((onReorder.mock.calls[0][0] as OTPAccount[]).map((a) => a.id)).toEqual([
      "a2",
      "a3",
      "a1",
    ]);
    expect(document.querySelector('[data-slot="drag-overlay"]')).not.toBeInTheDocument();
  });

  it("空闲挂载且未发生拖拽时不对卡片调用 getBoundingClientRect", () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");

    render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    const sortableCalls = rectSpy.mock.contexts.filter(
      (ctx) => ctx instanceof HTMLElement && ctx.hasAttribute("data-sortable-id"),
    );
    expect(sortableCalls).toHaveLength(0);
    rectSpy.mockRestore();
  });

  it("拖拽重排时仅为视口缓冲区内的邻居卡片创建 FLIP 动画，跳过远端屏外卡片", () => {
    const onReorder = vi.fn();
    const { container } = render(
      <DraggableAccountList
        accounts={sampleAccounts}
        groups={mockGroups}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />,
    );

    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-sortable-id]"));
    for (const el of items) {
      el.getBoundingClientRect = () => {
        const siblings = Array.from(container.querySelectorAll<HTMLElement>("[data-sortable-id]"));
        const idx = siblings.indexOf(el);
        const id = el.dataset.sortableId;
        if (id === "a2") {
          return makeDOMRect(20, 5000 + idx * 160, 260, 140);
        }
        return makeDOMRect(20 + idx * 280, 100, 260, 140);
      };
    }

    const cardA = getCard("Alpha");
    const cardB = getCard("Beta");
    const cardC = getCard("Gamma");

    fireEvent.pointerDown(cardA, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 700, clientY: 160 });

    expect(animateSpy.mock.contexts).toContain(cardC);
    expect(animateSpy.mock.contexts).not.toContain(cardB);

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 700, clientY: 160 });
  });

  describe("多选一起拖拽排序", () => {
    const fourAccounts: OTPAccount[] = [
      makeAccount({ id: "a1", issuer: "Alpha", name: "a@test.com", order: 0 }),
      makeAccount({ id: "a2", issuer: "Beta", name: "b@test.com", order: 1 }),
      makeAccount({ id: "a3", issuer: "Gamma", name: "c@test.com", order: 2 }),
      makeAccount({ id: "a4", issuer: "Delta", name: "d@test.com", order: 3 }),
    ];

    it("网格视图连续多选一起拖拽：折叠为统一占位槽、显示叠层背板与角标，并保持原相对顺序落地", () => {
      const onReorder = vi.fn();
      const { container } = render(
        <DraggableAccountList
          accounts={fourAccounts}
          groups={mockGroups}
          selectedIds={new Set(["a1", "a2"])}
          onToggleSelect={vi.fn()}
          onDelete={vi.fn()}
          onReorder={onReorder}
        />,
      );
      installDynamicRects(container, "grid");

      const cardA = getCard("Alpha");
      fireEvent.pointerDown(cardA, { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
      // 跨过阈值进入拖拽，先收拢为 [a1, a3, a4]
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 160 });

      expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
      expect(screen.getByText("将移入 2 个账户")).toBeInTheDocument();

      const overlay = document.querySelector('[data-slot="drag-overlay"]') as HTMLElement;
      expect(overlay).toHaveAttribute("data-drag-count", "2");
      expect(overlay.querySelector('[data-slot="drag-count-badge"]')).toHaveTextContent("2");
      expect(overlay.querySelectorAll('[data-slot="drag-stack-layer"]')).toHaveLength(1);

      // 拖到收拢后处于 slot 1 (300..560) 的 Gamma 上并松手
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 430, clientY: 160 });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 430, clientY: 160 });

      expect(onReorder).toHaveBeenCalledTimes(1);
      const reordered = onReorder.mock.calls[0][0] as OTPAccount[];
      expect(reordered.map((a) => a.id)).toEqual(["a3", "a1", "a2", "a4"]);
      expect(reordered.map((a) => a.order)).toEqual([0, 1, 2, 3]);
    });

    it("网格视图非连续多选（3 项显示两层背板，2 项非连续重排保持原相对顺序）", () => {
      const onReorder = vi.fn();
      const { container, rerender } = render(
        <DraggableAccountList
          accounts={fourAccounts}
          groups={mockGroups}
          selectedIds={new Set(["a1", "a2", "a3"])}
          onToggleSelect={vi.fn()}
          onDelete={vi.fn()}
          onReorder={onReorder}
        />,
      );
      installDynamicRects(container, "grid");

      fireEvent.pointerDown(getCard("Alpha"), { button: 0, pointerId: 1, clientX: 100, clientY: 160 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 160 });

      const overlay3 = document.querySelector('[data-slot="drag-overlay"]') as HTMLElement;
      expect(overlay3.querySelectorAll('[data-slot="drag-stack-layer"]')).toHaveLength(2);
      expect(overlay3.querySelector('[data-slot="drag-count-badge"]')).toHaveTextContent("3");
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onReorder).not.toHaveBeenCalled();

      // 重新以非连续选择 [a1, a3] 拖动 a3 到 a2 之前
      rerender(
        <DraggableAccountList
          accounts={fourAccounts}
          groups={mockGroups}
          selectedIds={new Set(["a1", "a3"])}
          onToggleSelect={vi.fn()}
          onDelete={vi.fn()}
          onReorder={onReorder}
        />,
      );
      installDynamicRects(container, "grid");

      const cardC = getCard("Gamma");
      fireEvent.pointerDown(cardC, { button: 0, pointerId: 2, clientX: 700, clientY: 160 });
      fireEvent.pointerMove(window, { pointerId: 2, clientX: 680, clientY: 160 });
      // 收拢后为 [a2(slot 0: 20..280), a3(slot 1: 300..560), a4(slot 2: 580..840)]
      fireEvent.pointerMove(window, { pointerId: 2, clientX: 120, clientY: 160 });
      fireEvent.pointerUp(window, { pointerId: 2, clientX: 120, clientY: 160 });

      expect(onReorder).toHaveBeenCalledTimes(1);
      expect((onReorder.mock.calls[0][0] as OTPAccount[]).map((a) => a.id)).toEqual([
        "a1",
        "a3",
        "a2",
        "a4",
      ]);
    });

    it("列表视图支持多选一起拖拽，同时保持原相对顺序", () => {
      const onReorder = vi.fn();
      const { container } = render(
        <DraggableAccountList
          accounts={sampleAccounts}
          groups={mockGroups}
          viewMode="list"
          selectedIds={new Set(["a1", "a2"])}
          onToggleSelect={vi.fn()}
          onDelete={vi.fn()}
          onReorder={onReorder}
        />,
      );
      installDynamicRects(container, "list");

      const rowA = getRow("Alpha");
      fireEvent.pointerDown(rowA, { button: 0, pointerId: 1, clientX: 120, clientY: 120 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 130 });

      expect(container.querySelectorAll('[data-slot="account-row"]')).toHaveLength(2);
      expect(screen.getByText("将移入 2 个账户")).toBeInTheDocument();
      const overlay = document.querySelector('[data-slot="drag-overlay"]') as HTMLElement;
      expect(overlay.querySelector('[data-slot="drag-count-badge"]')).toHaveTextContent("2");
      expect(overlay.querySelectorAll('[data-slot="drag-stack-layer"]')).toHaveLength(1);

      // 收拢后 Gamma 位于 slot 1 (top=160..216, mid=188)
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 120, clientY: 195 });
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 120, clientY: 195 });

      expect(onReorder).toHaveBeenCalledTimes(1);
      expect((onReorder.mock.calls[0][0] as OTPAccount[]).map((a) => a.id)).toEqual([
        "a3",
        "a1",
        "a2",
      ]);
    });

    it("拖拽未勾选卡片时仅单卡移动，不打包已选卡片也不显示角标", () => {
      const onReorder = vi.fn();
      const { container } = render(
        <DraggableAccountList
          accounts={fourAccounts}
          groups={mockGroups}
          selectedIds={new Set(["a1", "a2"])}
          onToggleSelect={vi.fn()}
          onDelete={vi.fn()}
          onReorder={onReorder}
        />,
      );
      installDynamicRects(container, "grid");

      const cardC = getCard("Gamma");
      fireEvent.pointerDown(cardC, { button: 0, pointerId: 1, clientX: 700, clientY: 160 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 430, clientY: 160 });

      const overlay = document.querySelector('[data-slot="drag-overlay"]') as HTMLElement;
      expect(overlay).toHaveAttribute("data-drag-count", "1");
      expect(overlay.querySelector('[data-slot="drag-count-badge"]')).not.toBeInTheDocument();
      expect(overlay.querySelectorAll('[data-slot="drag-stack-layer"]')).toHaveLength(0);

      fireEvent.pointerUp(window, { pointerId: 1, clientX: 430, clientY: 160 });
      expect(onReorder).toHaveBeenCalledTimes(1);
      expect((onReorder.mock.calls[0][0] as OTPAccount[]).map((a) => a.id)).toEqual([
        "a1",
        "a3",
        "a2",
        "a4",
      ]);
    });

    it("混合勾选置顶与未置顶且拖动未置顶项时，仅移动同分区已选项；跨分区与 Esc/无换位均取消恢复", () => {
      const onReorder = vi.fn();
      const mixed: OTPAccount[] = [
        makeAccount({ id: "p1", issuer: "PinOne", pinned: true, pinnedAt: 3000, order: 0 }),
        makeAccount({ id: "p2", issuer: "PinTwo", pinned: true, pinnedAt: 2000, order: 1 }),
        makeAccount({ id: "u1", issuer: "UnpinOne", pinned: false, order: 2 }),
        makeAccount({ id: "u2", issuer: "UnpinTwo", pinned: false, order: 3 }),
        makeAccount({ id: "u3", issuer: "UnpinThree", pinned: false, order: 4 }),
      ];

      const { container } = render(
        <DraggableAccountList
          accounts={mixed}
          groups={mockGroups}
          selectedIds={new Set(["p1", "u1", "u2"])}
          onToggleSelect={vi.fn()}
          onDelete={vi.fn()}
          onReorder={onReorder}
        />,
      );
      installDynamicRects(container, "grid");

      // 1. 仅微移未换位即松手：恢复全部 5 张卡片，不触发 onReorder
      fireEvent.pointerDown(getCard("UnpinOne"), { button: 0, pointerId: 1, clientX: 100, clientY: 360 });
      fireEvent.pointerMove(window, { pointerId: 1, clientX: 112, clientY: 360 });
      const overlay = document.querySelector('[data-slot="drag-overlay"]') as HTMLElement;
      expect(overlay).toHaveAttribute("data-drag-count", "2");
      expect(overlay.querySelector('[data-slot="drag-count-badge"]')).toHaveTextContent("2");
      expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(4);
      fireEvent.pointerUp(window, { pointerId: 1, clientX: 112, clientY: 360 });
      expect(onReorder).not.toHaveBeenCalled();
      expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(5);

      const overlayDuringSettle = document.querySelector('[data-slot="drag-overlay"]');
      const settleAnimIndex = animateSpy.mock.contexts.lastIndexOf(overlayDuringSettle);
      expect(settleAnimIndex).toBeGreaterThanOrEqual(0);
      const settleAnim1 = animateSpy.mock.results[settleAnimIndex]?.value as
        | { onfinish: ((ev: AnimationPlaybackEvent) => void) | null }
        | undefined;
      act(() => {
        settleAnim1?.onfinish?.(new Event("finish") as AnimationPlaybackEvent);
      });
      expect(document.querySelector('[data-slot="drag-overlay"]')).not.toBeInTheDocument();

      // 重新安装矩形模拟并测试拖入置顶禁止区
      installDynamicRects(container, "grid");
      fireEvent.pointerDown(getCard("UnpinOne"), { button: 0, pointerId: 2, clientX: 100, clientY: 360 });
      fireEvent.pointerMove(window, { pointerId: 2, clientX: 115, clientY: 360 });
      fireEvent.pointerMove(window, { pointerId: 2, clientX: 100, clientY: 160 });
      const forbiddenOverlay = document.querySelector('[data-slot="drag-overlay"]') as HTMLElement;
      expect(forbiddenOverlay).toHaveAttribute("data-drag-forbidden", "true");
      fireEvent.pointerUp(window, { pointerId: 2, clientX: 100, clientY: 160 });
      expect(onReorder).not.toHaveBeenCalled();
      expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(5);
      expect(document.querySelector('[data-slot="drag-overlay"]')).not.toBeInTheDocument();

      // 重新安装矩形模拟后将 u1, u2 一起拖到 u3 后面
      installDynamicRects(container, "grid");
      fireEvent.pointerDown(getCard("UnpinOne"), { button: 0, pointerId: 3, clientX: 100, clientY: 360 });
      fireEvent.pointerMove(window, { pointerId: 3, clientX: 115, clientY: 360 });
      // 收拢后 UnpinThree 在 other 区 slot 1 (left=300..560, top=300..440)
      fireEvent.pointerMove(window, { pointerId: 3, clientX: 430, clientY: 360 });
      fireEvent.pointerUp(window, { pointerId: 3, clientX: 430, clientY: 360 });

      expect(onReorder).toHaveBeenCalledTimes(1);
      expect((onReorder.mock.calls[0][0] as OTPAccount[]).map((a) => a.id)).toEqual([
        "p1",
        "p2",
        "u3",
        "u1",
        "u2",
      ]);
    });
  });
});
