import type { ReactNode } from 'react';

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;

  return (
    <div
      role="alert"
      className="rounded-2xl border border-danger-500/30 bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-700"
    >
      {children}
    </div>
  );
}
