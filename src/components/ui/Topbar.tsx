import Link from "next/link";
import { type ReactNode } from "react";

export function Topbar({
  backHref = "/",
  backLabel = "Fairway Live",
  actions,
}: {
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <Link
        href={backHref}
        className="text-sm font-medium text-emerald-800 hover:underline"
      >
        ← {backLabel}
      </Link>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </header>
  );
}
