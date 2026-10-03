import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-emerald-800 text-white shadow hover:bg-emerald-900 disabled:opacity-50",
  secondary:
    "border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-50",
  quiet: "text-stone-600 hover:text-emerald-900 hover:underline disabled:opacity-50",
  danger:
    "border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 disabled:opacity-50",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  fullWidth,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400",
        variants[variant],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
