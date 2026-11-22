import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface UseMarqueeSelectionOptions {
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  selectedIds: Set<string>;
  visibleIdSet: Set<string>;
  onSelectionChange: (nextIds: Set<string>) => void;
  itemSelector?: string;
  dragThresholdPx?: number;
}

export interface UseMarqueeSelectionResult {
  overlayRef: RefObject<HTMLDivElement | null>;
  handleMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
}

const INTERACTIVE_SELECTOR =
  'button,a,input,select,textarea,label,[role="button"],[role="menuitem"],[role="checkbox"],[role="dialog"],[aria-modal="true"],[role="menu"],[contenteditable="true"],[data-no-marquee="true"]';

const EDGE_ZONE = 48;
const TOP_SAFE_OFFSET = 56;
const MAX_SCROLL_STEP = 18;

export function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Rect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

export function shouldIgnoreMarqueeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  if (document.querySelector('[role="dialog"], [aria-modal="true"]')) {
    return true;
  }
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}

interface SelectableItemRect {
  id: string;
  rect: Rect;
}

interface DragState {
  phase: "idle" | "pending" | "dragging";
  startPageX: number;
  startPageY: number;
  lastClientX: number;
  lastClientY: number;
  additive: boolean;
  initialSelectedIds: Set<string>;
  lastEmittedIds: Set<string>;
  cachedItems: SelectableItemRect[];
  rectsDirty: boolean;
  rafId: number | null;
  prevUserSelect: string | null;
  cleanupListeners: (() => void) | null;
  cleanupSuppressClick: (() => void) | null;
}

export function useMarqueeSelection({
  containerRef,
  enabled,
  selectedIds,
  visibleIdSet,
  onSelectionChange,
  itemSelector = "[data-selectable-id]",
  dragThresholdPx = 6,
}: UseMarqueeSelectionOptions): UseMarqueeSelectionResult {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const enabledRef = useRef(enabled);
  const selectedIdsRef = useRef(selectedIds);
  const visibleIdSetRef = useRef(visibleIdSet);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const itemSelectorRef = useRef(itemSelector);
  const dragThresholdRef = useRef(dragThresholdPx);

  useLayoutEffect(() => {
    enabledRef.current = enabled;
    selectedIdsRef.current = selectedIds;
    visibleIdSetRef.current = visibleIdSet;
    onSelectionChangeRef.current = onSelectionChange;
    itemSelectorRef.current = itemSelector;
    dragThresholdRef.current = dragThresholdPx;
  }, [
    enabled,
    selectedIds,
    visibleIdSet,
    onSelectionChange,
    itemSelector,
    dragThresholdPx,
  ]);

  const dragRef = useRef<DragState>({
    phase: "idle",
    startPageX: 0,
    startPageY: 0,
    lastClientX: 0,
    lastClientY: 0,
    additive: false,
    initialSelectedIds: new Set(),
    lastEmittedIds: new Set(),
    cachedItems: [],
    rectsDirty: true,
    rafId: null,
    prevUserSelect: null,
    cleanupListeners: null,
    cleanupSuppressClick: null,
  });

  const measureItems = useCallback(() => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!container) {
      drag.cachedItems = [];
      drag.rectsDirty = false;
      return;
    }

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const visible = visibleIdSetRef.current;
    const elements = container.querySelectorAll<HTMLElement>(
      itemSelectorRef.current,
    );
    const items: SelectableItemRect[] = [];

    for (const el of elements) {
      const id = el.dataset.selectableId;
      if (!id || !visible.has(id)) {
        continue;
      }
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      items.push({
        id,
        rect: {
          left: box.left + scrollX,
          top: box.top + scrollY,
          right: box.right + scrollX,
          bottom: box.bottom + scrollY,
        },
      });
    }

    drag.cachedItems = items;
    drag.rectsDirty = false;
  }, [containerRef]);

  const updateSelectionAndOverlay = useCallback(() => {
    const drag = dragRef.current;
    if (drag.phase !== "dragging") {
      return;
    }

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const pageRect = normalizeRect(
      drag.startPageX,
      drag.startPageY,
      drag.lastClientX + scrollX,
      drag.lastClientY + scrollY,
    );

    const overlay = overlayRef.current;
    if (overlay) {
      overlay.style.display = "block";
      overlay.style.left = `${pageRect.left - scrollX}px`;
      overlay.style.top = `${pageRect.top - scrollY}px`;
      overlay.style.width = `${pageRect.right - pageRect.left}px`;
      overlay.style.height = `${pageRect.bottom - pageRect.top}px`;
      overlay.dataset.active = "true";
    }

    if (drag.rectsDirty) {
      measureItems();
    }

    const visible = visibleIdSetRef.current;
    const nextIds = drag.additive
      ? new Set(drag.initialSelectedIds)
      : new Set<string>();

    for (const item of drag.cachedItems) {
      if (visible.has(item.id) && rectsIntersect(pageRect, item.rect)) {
        nextIds.add(item.id);
      }
    }

    if (!areSetsEqual(drag.lastEmittedIds, nextIds)) {
      drag.lastEmittedIds = nextIds;
      onSelectionChangeRef.current(nextIds);
    }
  }, [measureItems]);

  const stopAutoScroll = useCallback(() => {
    const drag = dragRef.current;
    if (drag.rafId !== null) {
      window.cancelAnimationFrame(drag.rafId);
      drag.rafId = null;
    }
  }, []);

  const finishDrag = useCallback(
    (restoreInitial: boolean) => {
      const drag = dragRef.current;
      stopAutoScroll();

      if (drag.cleanupListeners) {
        drag.cleanupListeners();
        drag.cleanupListeners = null;
      }

      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.display = "none";
        overlay.dataset.active = "false";
      }

      if (drag.prevUserSelect !== null) {
        document.body.style.userSelect = drag.prevUserSelect;
        drag.prevUserSelect = null;
      }

      if (drag.phase === "dragging") {
        if (restoreInitial) {
          if (!areSetsEqual(drag.lastEmittedIds, drag.initialSelectedIds)) {
            onSelectionChangeRef.current(new Set(drag.initialSelectedIds));
          }
        } else {
          if (drag.cleanupSuppressClick) {
            drag.cleanupSuppressClick();
            drag.cleanupSuppressClick = null;
          }

          const suppressTrailingClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (drag.cleanupSuppressClick) {
              drag.cleanupSuppressClick();
              drag.cleanupSuppressClick = null;
            }
          };

          window.addEventListener("click", suppressTrailingClick, true);
          const timeoutId = window.setTimeout(() => {
            if (drag.cleanupSuppressClick) {
              drag.cleanupSuppressClick();
              drag.cleanupSuppressClick = null;
            }
          }, 0);

          drag.cleanupSuppressClick = () => {
            window.removeEventListener("click", suppressTrailingClick, true);
            window.clearTimeout(timeoutId);
          };
        }
      }

      drag.phase = "idle";
      drag.cachedItems = [];
      drag.rectsDirty = true;
    },
    [stopAutoScroll],
  );

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

  const ensureAutoScroll = useCallback(() => {
    const drag = dragRef.current;
    if (drag.phase !== "dragging") {
      stopAutoScroll();
      return;
    }

    const step = computeScrollStep(drag.lastClientY);
    if (step === 0) {
      stopAutoScroll();
      return;
    }

    if (drag.rafId !== null) {
      return;
    }

    const tick = () => {
      drag.rafId = null;
      if (drag.phase !== "dragging") {
        return;
      }

      const nextStep = computeScrollStep(drag.lastClientY);
      if (nextStep === 0) {
        return;
      }

      const prevY = window.scrollY;
      window.scrollBy(0, nextStep);
      if (window.scrollY === prevY) {
        return;
      }

      drag.rectsDirty = true;
      updateSelectionAndOverlay();
      drag.rafId = window.requestAnimationFrame(tick);
    };

    drag.rafId = window.requestAnimationFrame(tick);
  }, [computeScrollStep, stopAutoScroll, updateSelectionAndOverlay]);

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!enabledRef.current || event.button !== 0) {
        return;
      }
      if (shouldIgnoreMarqueeTarget(event.target)) {
        return;
      }

      const drag = dragRef.current;
      if (drag.phase !== "idle") {
        finishDrag(false);
      }
      if (drag.cleanupSuppressClick) {
        drag.cleanupSuppressClick();
        drag.cleanupSuppressClick = null;
      }

      drag.phase = "pending";
      drag.startPageX = event.clientX + window.scrollX;
      drag.startPageY = event.clientY + window.scrollY;
      drag.lastClientX = event.clientX;
      drag.lastClientY = event.clientY;
      drag.additive = event.ctrlKey || event.metaKey || event.shiftKey;
      drag.initialSelectedIds = new Set(selectedIdsRef.current);
      drag.lastEmittedIds = new Set(selectedIdsRef.current);
      drag.cachedItems = [];
      drag.rectsDirty = true;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        drag.lastClientX = moveEvent.clientX;
        drag.lastClientY = moveEvent.clientY;

        if (drag.phase === "pending") {
          const dx = moveEvent.clientX + window.scrollX - drag.startPageX;
          const dy = moveEvent.clientY + window.scrollY - drag.startPageY;
          if (Math.hypot(dx, dy) < dragThresholdRef.current) {
            return;
          }
          drag.phase = "dragging";
          drag.prevUserSelect = document.body.style.userSelect;
          document.body.style.userSelect = "none";
          window.getSelection()?.removeAllRanges();
          drag.rectsDirty = true;
        }

        updateSelectionAndOverlay();
        ensureAutoScroll();
      };

      const handleMouseUp = () => {
        finishDrag(false);
      };

      const handleWindowBlur = () => {
        finishDrag(false);
      };

      const handleContextMenu = () => {
        finishDrag(false);
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") {
          keyEvent.preventDefault();
          finishDrag(true);
        }
      };

      const handleScroll = () => {
        drag.rectsDirty = true;
        if (drag.phase === "dragging") {
          updateSelectionAndOverlay();
        }
      };

      const handleResize = () => {
        drag.rectsDirty = true;
      };

      const handleDragStart = (dragEvent: DragEvent) => {
        dragEvent.preventDefault();
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("blur", handleWindowBlur);
      window.addEventListener("contextmenu", handleContextMenu);
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleResize, { passive: true });
      window.addEventListener("dragstart", handleDragStart);

      drag.cleanupListeners = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("blur", handleWindowBlur);
        window.removeEventListener("contextmenu", handleContextMenu);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("dragstart", handleDragStart);
      };
    },
    [ensureAutoScroll, finishDrag, updateSelectionAndOverlay],
  );

  useEffect(() => {
    if (!enabled && dragRef.current.phase !== "idle") {
      finishDrag(false);
    }
  }, [enabled, finishDrag]);

  useEffect(() => {
    const drag = dragRef.current;
    return () => {
      finishDrag(false);
      if (drag.cleanupSuppressClick) {
        drag.cleanupSuppressClick();
        drag.cleanupSuppressClick = null;
      }
    };
  }, [finishDrag]);

  return { overlayRef, handleMouseDown };
}
