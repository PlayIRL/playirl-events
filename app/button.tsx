import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from "react";

const VARIANTS = {
  // Default — small light-gray chip. The canonical secondary-action style
  // used across public pages (Sign in, Subscribe, Share trigger, etc.).
  chip: "inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md bg-neutral-100 dark:bg-white/5 border border-neutral-100 dark:border-white/8 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white transition cursor-pointer",
  // Solid filled CTA — form submits and main confirm actions.
  primary: "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition cursor-pointer",
  // Borderless — cancel / dismiss / tertiary actions in forms.
  ghost: "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition cursor-pointer",
  // Square icon-only — admin row actions, modal close, info hints.
  icon: "inline-flex items-center justify-center w-7 h-7 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition cursor-pointer",
};

export type ButtonVariant = keyof typeof VARIANTS;

function classes(variant: ButtonVariant, className?: string): string {
  return className ? `${VARIANTS[variant]} ${className}` : VARIANTS[variant];
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "chip", className, type = "button", ...rest }, ref) => (
    <button ref={ref} type={type} className={classes(variant, className)} {...rest} />
  ),
);
Button.displayName = "Button";

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
};

export function LinkButton({ variant = "chip", className, ...rest }: LinkButtonProps) {
  return <Link className={classes(variant, className)} {...rest} />;
}
