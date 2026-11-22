import * as React from "react";
import { cn } from "../../lib/utils";

const Frame = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <section
      ref={ref}
      data-slot="frame"
      className={cn(
        "flex flex-col gap-1.5 rounded-frame border border-border/80 bg-muted/45 p-1.5",
        className,
      )}
      {...props}
    />
  ),
);
Frame.displayName = "Frame";

const FrameHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="frame-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-3.5 pt-2.5 pb-1.5",
        className,
      )}
      {...props}
    />
  ),
);
FrameHeader.displayName = "FrameHeader";

const FrameTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      data-slot="frame-title"
      className={cn(
        "text-sm font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
FrameTitle.displayName = "FrameTitle";

const FrameDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      data-slot="frame-description"
      className={cn("text-xs text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  ),
);
FrameDescription.displayName = "FrameDescription";

const FramePanel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="frame-panel"
      className={cn(
        "rounded-[calc(var(--frame-radius)-4px)] border border-border/85 bg-card p-5 text-card-foreground shadow-2xs",
        className,
      )}
      {...props}
    />
  ),
);
FramePanel.displayName = "FramePanel";

const FrameFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="frame-footer"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
FrameFooter.displayName = "FrameFooter";

export {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
  FrameFooter,
};
