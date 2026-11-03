import {
  forwardRef,
  useId,
  type SelectHTMLAttributes,
} from 'react';
import { ChevronDownIcon } from './icons';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  containerClassName?: string | undefined;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      id,
      label,
      hint,
      error,
      className = '',
      containerClassName = '',
      required,
      children,
      ...rest
    },
    ref,
  ) {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const hintId = hint ? `${selectId}-hint` : undefined;
    const errorId = error ? `${selectId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

    const borderClasses = error
      ? 'border-danger-500 focus:border-danger-500 focus-visible:ring-danger-500/25'
      : 'border-line-strong focus:border-primary-400 focus-visible:ring-primary-400/30';

    return (
      <div className={`space-y-1.5 ${containerClassName}`.trim()}>
        {label ? (
          <label
            htmlFor={selectId}
            className="block text-sm font-semibold text-ink"
          >
            {label}
            {required ? (
              <span aria-hidden="true" className="ml-0.5 text-danger-600">
                *
              </span>
            ) : null}
          </label>
        ) : null}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={[
              'h-11 w-full appearance-none rounded-control border bg-white px-3 pr-10 text-sm text-ink transition',
              'focus-visible:outline-none focus-visible:ring-2',
              'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint',
              borderClasses,
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...rest}
          >
            {children}
          </select>

          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-faint">
            <ChevronDownIcon size={16} />
          </span>
        </div>

        {error ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger-600">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-ink-soft">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
