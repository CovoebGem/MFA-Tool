import { useEffect, useState, type RefObject } from "react";

type VisibilityCallback = (visible: boolean) => void;

const elementCallbacks = new WeakMap<Element, VisibilityCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") {
    return null;
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const callback = elementCallbacks.get(entry.target);
          if (callback) {
            callback(entry.isIntersecting);
          }
        }
      },
      {
        rootMargin: "320px 0px",
        threshold: 0,
      },
    );
  }
  return sharedObserver;
}

/**
 * 复用单个全局 IntersectionObserver 判断目标元素是否处于可视区域或预加载缓冲区内，
 * 避免长列表/大网格下屏幕外卡片无效高频重绘。
 */
export function useViewportVisibility(
  targetRef: RefObject<Element | null>,
  enabled: boolean = true,
): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }

    const element = targetRef.current;
    const observer = getSharedObserver();
    if (!element || !observer) {
      setVisible(true);
      return;
    }

    elementCallbacks.set(element, setVisible);
    observer.observe(element);

    return () => {
      elementCallbacks.delete(element);
      observer.unobserve(element);
    };
  }, [targetRef, enabled]);

  return enabled ? visible : true;
}
