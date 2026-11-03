import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StarIcon } from './icons';

export type StarRatingSize = 'sm' | 'md' | 'lg';

export interface StarRatingProps {
  value: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: StarRatingSize;
  className?: string;
  label?: string;
}

const sizePixels: Record<StarRatingSize, number> = {
  sm: 14,
  md: 18,
  lg: 24,
};

function formatRating(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function StarRating({
  value,
  max = 5,
  onChange,
  size = 'md',
  className = '',
  label,
}: StarRatingProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<number | null>(null);

  const safeMax = Math.max(1, Math.floor(max));
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const displayValue = hovered ?? clamped;
  const pixelSize = sizePixels[size];
  const stars = Array.from({ length: safeMax }, (_, index) => index + 1);

  if (!onChange) {
    const accessibleLabel =
      label ??
      t('components.starRating.label', {
        value: formatRating(clamped),
        max: safeMax,
      });
    const fillPercent = (clamped / safeMax) * 100;

    return (
      <span
        role="img"
        aria-label={accessibleLabel}
        className={`inline-flex items-center ${className}`.trim()}
      >
        <span className="relative inline-flex" aria-hidden="true">
          <span className="flex gap-0.5 text-line-strong">
            {stars.map((star) => (
              <StarIcon key={star} size={pixelSize} filled={false} />
            ))}
          </span>
          <span
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: `${fillPercent}%` }}
          >
            <span className="flex gap-0.5 text-warning-500">
              {stars.map((star) => (
                <StarIcon key={star} size={pixelSize} filled />
              ))}
            </span>
          </span>
        </span>
      </span>
    );
  }

  return (
    <span
      role="group"
      aria-label={label ?? t('components.starRating.group')}
      className={`inline-flex items-center gap-0.5 ${className}`.trim()}
      onMouseLeave={() => setHovered(null)}
    >
      {stars.map((star) => {
        const active = star <= displayValue;

        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(null)}
            aria-label={t('components.starRating.rate', { value: star })}
            aria-pressed={star <= clamped}
            className="rounded-full p-0.5 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <StarIcon
              size={pixelSize}
              filled={active}
              className={active ? 'text-warning-500' : 'text-line-strong'}
            />
          </button>
        );
      })}
    </span>
  );
}
