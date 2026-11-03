import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'primary' | 'accent';

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  tone?: ChipTone;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const toneClasses: Record<ChipTone, string> = {
  neutral: 'bg-surface-sunken text-ink-soft',
  primary: 'bg-mint text-primary-800',
  accent: 'bg-accent-lime/20 text-brand-900',
};

const interactiveBaseClasses =
  'cursor-pointer transition hover:border-primary-400 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

export function Chip({
  children,
  selected = false,
  tone = 'neutral',
  onClick,
  disabled = false,
  className = '',
}: ChipProps) {
  const baseClasses =
    'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold';
  const selectedClasses = selected
    ? 'border border-primary-600 bg-primary-600 text-white'
    : `border border-transparent ${toneClasses[tone]}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        className={`${baseClasses} ${selectedClasses} ${interactiveBaseClasses} ${className}`
          .trim()
          .replace(/\s+/g, ' ')}
      >
        {children}
      </button>
    );
  }

  return (
    <span
      className={`${baseClasses} ${selectedClasses} ${className}`
        .trim()
        .replace(/\s+/g, ' ')}
    >
      {children}
    </span>
  );
}
