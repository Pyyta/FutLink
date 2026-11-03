export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

export function PageHeader({ title, subtitle, eyebrow }: PageHeaderProps) {
  return (
    <header className="space-y-1.5">
      {eyebrow ? (
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-primary-700">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-balance text-display text-ink">{title}</h1>
      {subtitle ? (
        <p className="text-sm leading-relaxed text-ink-soft">{subtitle}</p>
      ) : null}
    </header>
  );
}
