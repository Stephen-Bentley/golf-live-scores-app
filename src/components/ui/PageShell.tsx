import { type ReactNode } from "react";

type Width = "sm" | "md" | "lg" | "xl";

const widths: Record<Width, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function PageShell({
  children,
  width = "lg",
  center = false,
  className = "",
}: {
  children: ReactNode;
  width?: Width;
  center?: boolean;
  className?: string;
}) {
  return (
    <main
      className={[
        "mx-auto min-h-screen px-6 py-12",
        widths[width],
        center ? "flex flex-col justify-center" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </main>
  );
}
