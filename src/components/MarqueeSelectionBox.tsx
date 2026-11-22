import type { RefObject } from "react";

interface MarqueeSelectionBoxProps {
  overlayRef: RefObject<HTMLDivElement | null>;
}

export default function MarqueeSelectionBox({ overlayRef }: MarqueeSelectionBoxProps) {
  return (
    <div
      ref={overlayRef}
      data-slot="marquee-selection-box"
      data-active="false"
      aria-hidden="true"
      style={{ display: "none" }}
      className="pointer-events-none fixed z-[15] rounded-md border border-primary/70 bg-primary/12 shadow-2xs dark:bg-primary/20"
    />
  );
}
