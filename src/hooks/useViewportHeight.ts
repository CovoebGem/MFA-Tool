import { useLayoutEffect, useState } from "react";

function getViewportHeight() {
  return `${window.innerHeight}px`;
}

export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState(() => {
    if (typeof window === "undefined") {
      return "100vh";
    }

    return getViewportHeight();
  });

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let frameId: number | null = null;

    const updateViewportHeight = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setViewportHeight(getViewportHeight());
      });
    };

    setViewportHeight(getViewportHeight());

    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    window.addEventListener("fullscreenchange", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
      window.removeEventListener("fullscreenchange", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
    };
  }, []);

  return viewportHeight;
}
