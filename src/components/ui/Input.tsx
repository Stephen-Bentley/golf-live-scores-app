import { type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Input({ label, hint, error, id, className = "", ...props }: Props) {
  const inputId = id || props.name || label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label className="block text-sm font-medium text-stone-700" htmlFor={inputId}>
      {label}
      <input
        id={inputId}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 ${
          error ? "border-red-400" : "border-stone-300"
        } ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {hint && !error && (
        <span id={`${inputId}-hint`} className="mt-1 block text-xs text-stone-500">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} className="mt-1 block text-xs text-red-700" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
