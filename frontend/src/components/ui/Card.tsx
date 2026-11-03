import type { HTMLAttributes, ReactNode } from 'react';

export type CardTone = 'white' | 'mint' | 'brand';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: CardTone;
  padding?: CardPadding;
}

const toneClasses: Record<CardTone, string> = {
  white: 'border border-line bg-white text-ink shadow-card',
  mint: 'border border-primary-100 bg-mint text-ink',
  brand:
    'border border-white/10 bg-brand-950 bg-brand-glow text-white shadow-card',
};

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export function Card({
  children,
  tone = 'white',
  padding = 'md',
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-card ${toneClasses[tone]} ${paddingClasses[padding]} ${className}`
        .trim()
        .replace(/\s+/g, ' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
