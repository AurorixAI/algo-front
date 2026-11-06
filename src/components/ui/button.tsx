import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/lib/button-style";

export type { ButtonSize, ButtonVariant };

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A spinner instead of the icon; the button is off meanwhile. */
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

/**
 * The one button of the product (rules: lib/button-style.ts).  `data-variant` / `data-size` are what tests and e2e look at - never the class names.  The native `type` is left as it is
 * (a button inside a form that sends it says `type="submit"` itself, a plain one says `type="button"`).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading = false, icon, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      className={cn(buttonClass({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon ? <span className="flex-shrink-0">{icon}</span> : null}
      {children}
    </button>
  ),
);

Button.displayName = "Button";
