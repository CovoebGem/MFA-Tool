import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  collapseDraggedAccountGroup,
  expandDraggedAccountGroup,
  isAccountPinned,
  reorderAccounts,
  resolveSameSectionDraggedIds,
} from "../lib/sorter";
import type { AccountViewMode, OTPAccount } from "../types";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface UseSortableDragOptions {
  items: OTPAccount[];
  enabled: boolean;
  viewMode: AccountViewMode;
  containerRef: RefObject<HTMLElement | null>;
  selectedIds?: ReadonlySet<string>;
  onReorder: (reordered: OTPAccount[]) => void;
}

export interface ActiveDragOverlay {
  account: OTPAccount;
  width: number;
  height: number;
  initialLeft: number;
  initialTop: number;
  draggedCount: number;
  forbidden: boolean;
  settling: boolean;
}

export interface UseSortableDragResult {
  orderedItems: OTPAccount[];
  activeDrag: ActiveDragOverlay | null;
  draggingId: string | null;
  overlayRef: RefObject<HTMLDivElement | null>;
  handleItemPointerDown: (
    accountId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
}

const DRAG_THRESHOLD_PX = 5;
const EDGE_ZONE = 48;
const TOP_SAFE_OFFSET = 56;
const MAX_SCROLL_STEP = 18;
const FLIP_DURATION_MS = 220;
const SETTLE_DURATION_MS = 180;
const SETTLE_FALLBACK_MS = 240;
const FLIP_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";

const INTERACTIVE_DRAG_IGNORE_SELECTOR =
  'button,a,input,select,textarea,label,[role="button"],[role="checkbox"],[role="menuitem"],[contenteditable="true"]';

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function toDocRect(box: DOMRect): Rect {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  return {
    left: box.left + scrollX,
    top: box.top + scrollY,
    right: box.right + scrollX,
    bottom: box.bottom + scrollY,
    width: box.width,
    height: box.height,
  };
}

function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function areAccountOrdersEqual(a: OTPAccount[], b: OTPAccount[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) {
      return false;
    }
  }
  return true;
}

export function shouldIgnoreDragStart(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  if (target.closest('[data-drag-handle="true"]')) {
    return false;
  }
  if (document.querySelector('[role="dialog"], [aria-modal="true"]')) {
    return true;
  }
  return Boolean(target.closest(INTERACTIVE_DRAG_IGNORE_SELECTOR));
}

interface DragSession {
  phase: "pending" | "dragging";
  draggedId: string;
  pointerId: number | undefined;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  initialLeft: number;
  initialTop: number;
  initialItems: OTPAccount[];
  currentItems: OTPAccount[];
  draggedAccounts: OTPAccount[];
  draggedIdSet: Set<string>;
  didReorder: boolean;
  forbidden: boolean;
  pendingSwapCheckId: string | null;
  recentlySwappedId: string | null;
  prevUserSelect: string | null;
  prevCursor: string | null;
  rafId: number | null;
  cleanupListeners: (() => void) | null;
}

export function useSortableDrag({
  items,
  enabled,
  viewMode,
  containerRef,
  selectedIds,
  onReorder,
}: UseSortableDragOptions): UseSortableDragResult {
  const [previewItems, setPreviewItems] = useState<OTPAccount[] | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDragOverlay | null>(null);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const layoutRectsRef = useRef<Map<string, Rect>>(new Map());
  const pendingFlipRectsRef = useRef<Map<string, Rect> | null>(null);
  const activeAnimsRef = useRef<Map<string, Animation>>(new Map());
  const sessionRef = useRef<DragSession | null>(null);
  const settleAnimRef = useRef<Animation | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const cleanupSuppressClickRef = useRef<(() => void) | null>(null);

  const itemsRef = useRef(items);
  const enabledRef = useRef(enabled);
  const viewModeRef = useRef(viewMode);
  const selectedIdsRef = useRef(selectedIds);
  const onReorderRef = useRef(onReorder);

  useLayoutEffect(() => {
    itemsRef.current = items;
    enabledRef.current = enabled;
    viewModeRef.current = viewMode;
    selectedIdsRef.current = selectedIds;
    onReorderRef.current = onReorder;
  }, [items, enabled, viewMode, selectedIds, onReorder]);

  const cancelAllItemAnimations = useCallback(() => {
    for (const anim of activeAnimsRef.current.values()) {
      try {
        anim.cancel();
      } catch {
        // 忽略已结束动画清理异常
      }
    }
    activeAnimsRef.current.clear();
  }, []);

  const clearSettle = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (settleAnimRef.current) {
      const anim = settleAnimRef.current;
      settleAnimRef.current = null;
      anim.onfinish = null;
      anim.oncancel = null;
      try {
        anim.cancel();
      } catch {
        // 忽略已结束动画清理异常
      }
    }
  }, []);

  const clearSuppressClick = useCallback(() => {
    if (cleanupSuppressClickRef.current) {
      cleanupSuppressClickRef.current();
      cleanupSuppressClickRef.current = null;
    }
  }, []);

  const suppressTrailingClick = useCallback(() => {
    clearSuppressClick();

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      clearSuppressClick();
    };

    window.addEventListener("click", handleClick, true);
    const timeoutId = window.setTimeout(() => {
      clearSuppressClick();
    }, 0);

    cleanupSuppressClickRef.current = () => {
      window.removeEventListener("click", handleClick, true);
      window.clearTimeout(timeoutId);
    };
  }, [clearSuppressClick]);

  const measureLayoutRects = useCallback(() => {
    const container = containerRef.current;
    const next = new Map<string, Rect>();
    if (!container) {
      layoutRectsRef.current = next;
      return;
    }

    const elements = container.querySelectorAll<HTMLElement>("[data-sortable-id]");
    for (const el of elements) {
      const id = el.dataset.sortableId;
      if (!id) continue;
      next.set(id, toDocRect(el.getBoundingClientRect()));
    }
    layoutRectsRef.current = next;
  }, [containerRef]);

  const captureVisualRects = useCallback(
    (options?: {
      excludeId?: string;
      seedFromAnchor?: { anchorId: string; ids: readonly string[] };
    }) => {
      const container = containerRef.current;
      if (!container) {
        pendingFlipRectsRef.current = null;
        return;
      }

      const map = new Map<string, Rect>();
      const elements = container.querySelectorAll<HTMLElement>("[data-sortable-id]");
      for (const el of elements) {
        const id = el.dataset.sortableId;
        if (!id) continue;
        map.set(id, toDocRect(el.getBoundingClientRect()));
      }

      if (options?.seedFromAnchor) {
        const anchorRect = map.get(options.seedFromAnchor.anchorId);
        if (anchorRect) {
          for (const id of options.seedFromAnchor.ids) {
            if (!map.has(id)) {
              map.set(id, anchorRect);
            }
          }
        }
      }

      if (options?.excludeId) {
        map.delete(options.excludeId);
      }

      pendingFlipRectsRef.current = map;
    },
    [containerRef],
  );

  const stopAutoScroll = useCallback((session: DragSession | null) => {
    if (session && session.rafId !== null) {
      window.cancelAnimationFrame(session.rafId);
      session.rafId = null;
    }
  }, []);

  const computeScrollStep = useCallback((clientY: number): number => {
    const topZoneBottom = TOP_SAFE_OFFSET + EDGE_ZONE;
    if (clientY < topZoneBottom && window.scrollY > 0) {
      const intensity = Math.min(
        1,
        Math.max(0.1, (topZoneBottom - clientY) / EDGE_ZONE),
      );
      return -Math.ceil(intensity * MAX_SCROLL_STEP);
    }

    const viewportHeight = window.innerHeight;
    const bottomZoneTop = viewportHeight - EDGE_ZONE;
    const maxScrollY = Math.max(
      0,
      document.documentElement.scrollHeight - viewportHeight,
    );
    if (clientY > bottomZoneTop && window.scrollY < maxScrollY) {
      const intensity = Math.min(
        1,
        Math.max(0.1, (clientY - bottomZoneTop) / EDGE_ZONE),
      );
      return Math.ceil(intensity * MAX_SCROLL_STEP);
    }

    return 0;
  }, []);

  const isPointerInForbiddenSection = useCallback(
    (pageX: number, pageY: number, draggedPinned: boolean, currentItems: OTPAccount[]): boolean => {
      const rects = layoutRectsRef.current;
      for (const item of currentItems) {
        if (isAccountPinned(item) === draggedPinned) {
          continue;
        }
        const rect = rects.get(item.id);
        if (rect && rect.width > 0 && rect.height > 0 && pointInRect(pageX, pageY, rect)) {
          return true;
        }
      }

      const container = containerRef.current;
      if (container) {
        const forbiddenSelector = draggedPinned
          ? '[data-sortable-section="other"]'
          : '[data-sortable-section="pinned"]';
        const forbiddenSection = container.querySelector<HTMLElement>(forbiddenSelector);
        if (forbiddenSection) {
          const sectionRect = toDocRect(forbiddenSection.getBoundingClientRect());
          if (
            sectionRect.width > 0 &&
            sectionRect.height > 0 &&
            pointInRect(pageX, pageY, sectionRect)
          ) {
            return true;
          }
        }
      }

      return false;
    },
    [containerRef],
  );

  const updateHitTest = useCallback(
    (session: DragSession) => {
      if (session.phase !== "dragging") {
        return;
      }

      const pageX = session.lastClientX + window.scrollX;
      const pageY = session.lastClientY + window.scrollY;
      const currentItems = session.currentItems;
      const draggedIndex = currentItems.findIndex((item) => item.id === session.draggedId);
      if (draggedIndex === -1) {
        return;
      }

      const draggedAccount = currentItems[draggedIndex];
      const draggedPinned = isAccountPinned(draggedAccount);

      const forbidden = isPointerInForbiddenSection(
        pageX,
        pageY,
        draggedPinned,
        currentItems,
      );

      if (forbidden !== session.forbidden) {
        session.forbidden = forbidden;
        document.body.style.cursor = forbidden ? "not-allowed" : "grabbing";
        setActiveDrag((prev) => (prev ? { ...prev, forbidden } : null));
      }

      if (forbidden) {
        return;
      }

      const rects = layoutRectsRef.current;
      const draggedRect = rects.get(session.draggedId);
      const draggedMidY = draggedRect
        ? (draggedRect.top + draggedRect.bottom) / 2
        : pageY;

      if (session.recentlySwappedId) {
        const recentRect = rects.get(session.recentlySwappedId);
        if (!recentRect || !pointInRect(pageX, pageY, recentRect)) {
          session.recentlySwappedId = null;
        }
      }

      let targetIndex = -1;
      let targetId: string | null = null;
      const mode = viewModeRef.current;

      for (let i = 0; i < currentItems.length; i += 1) {
        const candidate = currentItems[i];
        if (
          candidate.id === session.draggedId ||
          candidate.id === session.recentlySwappedId ||
          isAccountPinned(candidate) !== draggedPinned
        ) {
          continue;
        }

        const rect = rects.get(candidate.id);
        if (!rect || rect.width <= 0 || rect.height <= 0 || !pointInRect(pageX, pageY, rect)) {
          continue;
        }

        const movingForward = i > draggedIndex;
        if (mode === "list") {
          const midY = (rect.top + rect.bottom) / 2;
          if (movingForward ? pageY >= midY : pageY <= midY) {
            targetIndex = i;
            targetId = candidate.id;
            break;
          }
        } else {
          const targetMidY = (rect.top + rect.bottom) / 2;
          const sameRow = Math.abs(targetMidY - draggedMidY) < rect.height * 0.5;
          if (sameRow) {
            const matched = movingForward
              ? pageX >= rect.left + rect.width * 0.35
              : pageX <= rect.right - rect.width * 0.35;
            if (matched) {
              targetIndex = i;
              targetId = candidate.id;
              break;
            }
          } else {
            const matched = movingForward
              ? pageY >= rect.top + rect.height * 0.25
              : pageY <= rect.bottom - rect.height * 0.25;
            if (matched) {
              targetIndex = i;
              targetId = candidate.id;
              break;
            }
          }
        }
      }

      if (targetIndex !== -1 && targetIndex !== draggedIndex && targetId) {
        captureVisualRects();
        const nextItems = reorderAccounts(currentItems, draggedIndex, targetIndex);
        session.currentItems = nextItems;
        session.didReorder = true;
        session.pendingSwapCheckId = targetId;
        session.recentlySwappedId = null;
        setPreviewItems(nextItems);
      }
    },
    [captureVisualRects, isPointerInForbiddenSection],
  );

  const ensureAutoScroll = useCallback(
    (session: DragSession) => {
      if (session.phase !== "dragging") {
        stopAutoScroll(session);
        return;
      }

      const step = computeScrollStep(session.lastClientY);
      if (step === 0) {
        stopAutoScroll(session);
        return;
      }

      if (session.rafId !== null) {
        return;
      }

      const tick = () => {
        session.rafId = null;
        if (sessionRef.current !== session || session.phase !== "dragging") {
          return;
        }

        const nextStep = computeScrollStep(session.lastClientY);
        if (nextStep === 0) {
          return;
        }

        const prevY = window.scrollY;
        window.scrollBy(0, nextStep);
        if (window.scrollY === prevY) {
          return;
        }

        measureLayoutRects();
        updateHitTest(session);
        session.rafId = window.requestAnimationFrame(tick);
      };

      session.rafId = window.requestAnimationFrame(tick);
    },
    [computeScrollStep, measureLayoutRects, stopAutoScroll, updateHitTest],
  );

  const finishSession = useCallback(
    (cancelled: boolean) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      sessionRef.current = null;
      stopAutoScroll(session);

      if (session.cleanupListeners) {
        session.cleanupListeners();
        session.cleanupListeners = null;
      }

      if (session.prevUserSelect !== null) {
        document.body.style.userSelect = session.prevUserSelect;
        session.prevUserSelect = null;
      }
      if (session.prevCursor !== null) {
        document.body.style.cursor = session.prevCursor;
        session.prevCursor = null;
      }

      if (session.phase === "pending") {
        return;
      }

      suppressTrailingClick();

      const rejected = cancelled || session.forbidden;
      const isGroupedDrag = session.draggedAccounts.length > 1;
      const finalItems =
        rejected || !session.didReorder
          ? session.initialItems
          : isGroupedDrag
            ? expandDraggedAccountGroup(
                session.currentItems,
                session.draggedId,
                session.draggedAccounts,
              )
            : session.currentItems;
      const orderChanged =
        !rejected &&
        session.didReorder &&
        !areAccountOrdersEqual(session.initialItems, finalItems);

      if (rejected) {
        const needsRestore =
          isGroupedDrag || !areAccountOrdersEqual(session.initialItems, session.currentItems);
        if (needsRestore) {
          captureVisualRects(
            isGroupedDrag
              ? {
                  seedFromAnchor: {
                    anchorId: session.draggedId,
                    ids: session.draggedAccounts.map((a) => a.id),
                  },
                }
              : undefined,
          );
          setPreviewItems(session.initialItems);
        }
        setActiveDrag(null);
        if (!needsRestore) {
          setPreviewItems(null);
        } else {
          // 在 reduced-motion 或无动画环境下，一帧后释放 previewItems
          window.setTimeout(() => {
            if (!sessionRef.current) {
              setPreviewItems(null);
            }
          }, 0);
        }
        return;
      }

      if (orderChanged) {
        onReorderRef.current(finalItems);
      }

      const overlayEl = overlayRef.current;
      const targetEl = containerRef.current?.querySelector<HTMLElement>(
        `[data-sortable-id="${CSS?.escape ? CSS.escape(session.draggedId) : session.draggedId}"]`,
      );
      const targetBox = targetEl?.getBoundingClientRect();
      const canSettleAnimate =
        !prefersReducedMotion() &&
        Boolean(overlayEl) &&
        typeof overlayEl?.animate === "function" &&
        Boolean(targetBox) &&
        (targetBox?.width ?? 0) > 0 &&
        (targetBox?.height ?? 0) > 0;

      if (!canSettleAnimate) {
        setActiveDrag(null);
        setPreviewItems(null);
        return;
      }

      if (isGroupedDrag) {
        captureVisualRects({
          excludeId: session.draggedId,
          seedFromAnchor: {
            anchorId: session.draggedId,
            ids: session.draggedAccounts.map((a) => a.id),
          },
        });
        setPreviewItems(finalItems);
      }

      setActiveDrag((prev) =>
        prev ? { ...prev, forbidden: false, settling: true } : null,
      );
    },
    [captureVisualRects, containerRef, stopAutoScroll, suppressTrailingClick],
  );

  // 初始化悬浮克隆层 transform（首次挂载时避免停留在 (0, 0)）
  useLayoutEffect(() => {
    if (!activeDrag || activeDrag.settling) {
      return;
    }
    const overlayEl = overlayRef.current;
    if (overlayEl) {
      const { x, y } = overlayPosRef.current;
      overlayEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }, [activeDrag]);

  // 松手归位动画：从当前指针跟随位置平滑落回目标槽位
  useLayoutEffect(() => {
    if (!activeDrag?.settling) {
      return;
    }

    clearSettle();
    const overlayEl = overlayRef.current;
    const selectorId = CSS?.escape ? CSS.escape(activeDrag.account.id) : activeDrag.account.id;
    const targetEl = containerRef.current?.querySelector<HTMLElement>(
      `[data-sortable-id="${selectorId}"]`,
    );
    const targetBox = targetEl?.getBoundingClientRect();

    if (
      !overlayEl ||
      typeof overlayEl.animate !== "function" ||
      !targetBox ||
      targetBox.width <= 0 ||
      targetBox.height <= 0
    ) {
      setActiveDrag(null);
      setPreviewItems(null);
      return;
    }

    const from = overlayPosRef.current;
    const anim = overlayEl.animate(
      [
        { transform: `translate3d(${from.x}px, ${from.y}px, 0)` },
        { transform: `translate3d(${targetBox.left}px, ${targetBox.top}px, 0)` },
      ],
      {
        duration: SETTLE_DURATION_MS,
        easing: FLIP_EASING,
        fill: "forwards",
      },
    );
    settleAnimRef.current = anim;

    const completeSettle = () => {
      clearSettle();
      setActiveDrag(null);
      setPreviewItems(null);
    };

    anim.onfinish = completeSettle;
    anim.oncancel = completeSettle;
    settleTimerRef.current = window.setTimeout(completeSettle, SETTLE_FALLBACK_MS);

    return () => {
      clearSettle();
    };
  }, [activeDrag?.settling, activeDrag?.account.id, clearSettle, containerRef]);

  // 每次实时重排后刷新真实布局矩形并执行 WAAPI FLIP 让位动画
  const orderedItems = previewItems ?? items;
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      pendingFlipRectsRef.current = null;
      return;
    }

    const prevRects = pendingFlipRectsRef.current;
    pendingFlipRectsRef.current = null;

    if (!prevRects && sessionRef.current?.phase !== "dragging") {
      return;
    }

    const elements = container.querySelectorAll<HTMLElement>("[data-sortable-id]");
    const nextLayoutRects = new Map<string, Rect>();
    const draggedId = sessionRef.current?.draggedId ?? null;
    const reduceMotion = prefersReducedMotion();
    const viewportTop = window.scrollY - 300;
    const viewportBottom = window.scrollY + window.innerHeight + 300;
    const isNearViewport = (rect: Rect) =>
      rect.bottom >= viewportTop && rect.top <= viewportBottom;

    for (const el of elements) {
      const id = el.dataset.sortableId;
      if (!id) continue;

      const existingAnim = activeAnimsRef.current.get(id);
      if (existingAnim) {
        activeAnimsRef.current.delete(id);
        try {
          existingAnim.cancel();
        } catch {
          // 忽略取消异常
        }
      }

      const nextDocRect = toDocRect(el.getBoundingClientRect());
      nextLayoutRects.set(id, nextDocRect);

      if (
        !prevRects ||
        reduceMotion ||
        id === draggedId ||
        typeof el.animate !== "function"
      ) {
        continue;
      }

      const prevDocRect = prevRects.get(id);
      if (!prevDocRect) {
        continue;
      }

      if (!isNearViewport(prevDocRect) && !isNearViewport(nextDocRect)) {
        continue;
      }

      const dx = prevDocRect.left - nextDocRect.left;
      const dy = prevDocRect.top - nextDocRect.top;
      if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) {
        continue;
      }

      const anim = el.animate(
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: FLIP_DURATION_MS,
          easing: FLIP_EASING,
        },
      );
      activeAnimsRef.current.set(id, anim);
      const cleanup = () => {
        if (activeAnimsRef.current.get(id) === anim) {
          activeAnimsRef.current.delete(id);
        }
      };
      anim.onfinish = cleanup;
      anim.oncancel = cleanup;
    }

    layoutRectsRef.current = nextLayoutRects;

    const activeSession = sessionRef.current;
    if (activeSession?.pendingSwapCheckId) {
      const checkedId = activeSession.pendingSwapCheckId;
      activeSession.pendingSwapCheckId = null;
      const checkedRect = nextLayoutRects.get(checkedId);
      const curX = activeSession.lastClientX + window.scrollX;
      const curY = activeSession.lastClientY + window.scrollY;
      activeSession.recentlySwappedId =
        checkedRect && pointInRect(curX, curY, checkedRect) ? checkedId : null;
    }
  }, [orderedItems, containerRef]);

  const handleItemPointerDown = useCallback(
    (accountId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (
        !enabledRef.current ||
        event.button !== 0 ||
        (event.pointerType === "touch" && event.isPrimary === false)
      ) {
        return;
      }
      if (shouldIgnoreDragStart(event.target)) {
        return;
      }

      // 若仍在执行上一次的松手归位动画，立即中断并开启新拖拽
      const wasSettling =
        settleTimerRef.current !== null || settleAnimRef.current !== null;
      clearSettle();
      if (wasSettling) {
        setActiveDrag(null);
        setPreviewItems(null);
      }
      clearSuppressClick();
      if (sessionRef.current) {
        finishSession(true);
      }

      const currentItems = itemsRef.current;
      const account = currentItems.find((item) => item.id === accountId);
      if (!account) {
        return;
      }

      const itemEl = event.currentTarget;
      const box = itemEl.getBoundingClientRect();

      const session: DragSession = {
        phase: "pending",
        draggedId: accountId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        offsetX: event.clientX - box.left,
        offsetY: event.clientY - box.top,
        width: box.width,
        height: box.height,
        initialLeft: box.left,
        initialTop: box.top,
        initialItems: currentItems,
        currentItems,
        draggedAccounts: [account],
        draggedIdSet: new Set([accountId]),
        didReorder: false,
        forbidden: false,
        pendingSwapCheckId: null,
        recentlySwappedId: null,
        prevUserSelect: null,
        prevCursor: null,
        rafId: null,
        cleanupListeners: null,
      };
      sessionRef.current = session;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (
          moveEvent.pointerId !== undefined &&
          session.pointerId !== undefined &&
          moveEvent.pointerId !== session.pointerId
        ) {
          return;
        }

        session.lastClientX = moveEvent.clientX;
        session.lastClientY = moveEvent.clientY;

        if (session.phase === "pending") {
          const dx = moveEvent.clientX - session.startClientX;
          const dy = moveEvent.clientY - session.startClientY;
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
            return;
          }

          session.phase = "dragging";
          session.prevUserSelect = document.body.style.userSelect;
          session.prevCursor = document.body.style.cursor;
          document.body.style.userSelect = "none";
          document.body.style.cursor = "grabbing";
          window.getSelection()?.removeAllRanges();

          measureLayoutRects();

          const effectiveDraggedIds = resolveSameSectionDraggedIds(
            session.initialItems,
            session.draggedId,
            selectedIdsRef.current,
          );
          const { collapsed, draggedAccounts } = collapseDraggedAccountGroup(
            session.initialItems,
            session.draggedId,
            effectiveDraggedIds,
          );
          const groupDragged = draggedAccounts.length > 1;
          session.draggedAccounts = draggedAccounts.length > 0 ? draggedAccounts : [account];
          session.draggedIdSet =
            draggedAccounts.length > 0
              ? effectiveDraggedIds
              : new Set([session.draggedId]);
          session.currentItems = groupDragged ? collapsed : session.initialItems;

          if (groupDragged) {
            captureVisualRects({ excludeId: session.draggedId });
          }

          const nextX = moveEvent.clientX - session.offsetX;
          const nextY = moveEvent.clientY - session.offsetY;
          overlayPosRef.current = { x: nextX, y: nextY };

          setPreviewItems(session.currentItems);
          setActiveDrag({
            account,
            width: session.width,
            height: session.height,
            initialLeft: session.initialLeft,
            initialTop: session.initialTop,
            draggedCount: session.draggedAccounts.length,
            forbidden: false,
            settling: false,
          });
        }

        const nextX = moveEvent.clientX - session.offsetX;
        const nextY = moveEvent.clientY - session.offsetY;
        overlayPosRef.current = { x: nextX, y: nextY };
        if (overlayRef.current) {
          overlayRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
        }

        updateHitTest(session);
        ensureAutoScroll(session);
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        if (
          upEvent.pointerId !== undefined &&
          session.pointerId !== undefined &&
          upEvent.pointerId !== session.pointerId
        ) {
          return;
        }
        finishSession(false);
      };

      const handleCancel = () => {
        finishSession(true);
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") {
          keyEvent.preventDefault();
          finishSession(true);
        }
      };

      const handleScroll = () => {
        if (session.phase === "dragging") {
          measureLayoutRects();
          updateHitTest(session);
        }
      };

      const handleResize = () => {
        if (session.phase === "dragging") {
          measureLayoutRects();
        }
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handleCancel);
      window.addEventListener("blur", handleCancel);
      window.addEventListener("contextmenu", handleCancel);
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleResize, { passive: true });

      session.cleanupListeners = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handleCancel);
        window.removeEventListener("blur", handleCancel);
        window.removeEventListener("contextmenu", handleCancel);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleResize);
      };
    },
    [
      captureVisualRects,
      clearSettle,
      clearSuppressClick,
      ensureAutoScroll,
      finishSession,
      measureLayoutRects,
      updateHitTest,
    ],
  );

  // 当拖拽被禁用或外部数据强制中止时安全清理
  useEffect(() => {
    if (!enabled && sessionRef.current) {
      finishSession(true);
    }
  }, [enabled, finishSession]);

  // 组件卸载清理
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        const session = sessionRef.current;
        sessionRef.current = null;
        stopAutoScroll(session);
        session.cleanupListeners?.();
        if (session.prevUserSelect !== null) {
          document.body.style.userSelect = session.prevUserSelect;
        }
        if (session.prevCursor !== null) {
          document.body.style.cursor = session.prevCursor;
        }
      }
      clearSettle();
      clearSuppressClick();
      cancelAllItemAnimations();
    };
  }, [cancelAllItemAnimations, clearSettle, clearSuppressClick, stopAutoScroll]);

  return {
    orderedItems,
    activeDrag,
    draggingId: activeDrag ? activeDrag.account.id : null,
    overlayRef,
    handleItemPointerDown,
  };
}
