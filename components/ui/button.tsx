import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Icon, type IconName } from "./icons";

// Buttons (design.md sections 3 and 4.4): at least 44 px, sentence case, saying exactly what happens.
type Variant = "primary" | "secondary" | "destructive" | "quiet";

const STYLES: Record<Variant, string> = {
  primary: "bg-emerald text-white hover:brightness-95",
  secondary: "bg-page text-ink border border-control-edge hover:bg-showroom",
  destructive: "bg-red-pen text-white hover:brightness-95",
  quiet: "bg-transparent text-emerald hover:bg-emerald-wash",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: IconName;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function buttonClasses(variant: Variant = "primary", extra = "") {
  return [
    "focus-ring type-label inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-control px-4",
    "transition-[filter,background-color] duration-quick ease-arrive",
    "disabled:cursor-not-allowed disabled:opacity-55",
    STYLES[variant],
    extra,
  ].join(" ");
}

export function Button({ variant = "primary", icon, children, className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
