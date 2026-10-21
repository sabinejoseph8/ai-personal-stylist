import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./icons";

// A choice the shopper can turn on and off, such as a department or style word.
export function Chip({
  selected,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={[
        "focus-ring type-label inline-flex min-h-touch items-center gap-1.5 rounded-pill border px-4",
        "transition-colors duration-standard ease-arrive disabled:cursor-not-allowed disabled:opacity-55",
        selected ? "border-emerald bg-emerald-wash text-ink" : "border-control-edge bg-page text-ink hover:bg-showroom",
        className,
      ].join(" ")}
      {...rest}
    >
      {selected && <Icon name="confirmed" className="text-emerald" />}
      {children}
    </button>
  );
}
