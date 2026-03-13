import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  active = false,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <div className={`${active ? "glass-card-active" : "glass-card"} p-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </h3>
  );
}

export function CardValue({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 text-2xl font-bold text-slate-50">{children}</p>
  );
}
