import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const alertVariants = cva(
  "relative flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/50 text-foreground",
        destructive:
          "border-destructive/30 bg-destructive-surface text-destructive-foreground",
        warning:
          "border-warning/30 bg-warning-surface text-warning-foreground",
        success:
          "border-success/30 bg-success-surface text-success-foreground",
        info: "border-info/30 bg-info-surface text-info-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("font-semibold leading-snug tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-xs opacity-90 leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
