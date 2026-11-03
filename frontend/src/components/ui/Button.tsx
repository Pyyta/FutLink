import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white shadow-sm hover:bg-primary-700 focus-visible:ring-primary-400',
  secondary:
    'bg-mint text-primary-800 hover:bg-mint-strong focus-visible:ring-primary-400',
  outline:
    'border border-line-strong bg-white text-ink hover:border-primary-300 hover:bg-primary-50 focus-visible:ring-primary-400',
  ghost:
    'bg-transparent text-ink-soft hover:bg-surface-sunken hover:text-ink focus-visible:ring-primary-300',
  danger:
    'bg-danger-600 text-white shadow-sm hover:bg-danger-700 focus-visible:ring-danger-500',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      leadingIcon,
      trailingIcon,
      className = '',
      type = 'button',
      disabled,
      children,
      ...rest
    },
    ref,
  ) {
    const classes = [
      'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-60',
      variantClasses[variant],
      sizeClasses[size],
      fullWidth ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? (
          <Spinner size={size === 'sm' ? 14 : 18} />
        ) : (
          leadingIcon
        )}
        {children}
        {!loading && trailingIcon}
      </button>
    );
  },
);
