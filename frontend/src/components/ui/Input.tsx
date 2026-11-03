import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerClassName?: string | undefined;
}

const inputBaseClasses =
  'h-11 w-full rounded-control border bg-white px-3 text-sm text-ink placeholder:text-ink-faint transition disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    hint,
    error,
    leading,
    trailing,
    className = '',
    containerClassName = '',
    required,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const borderClasses = error
    ? 'border-danger-500 focus:border-danger-500 focus-visible:ring-danger-500/25'
    : 'border-line-strong focus:border-primary-400 focus-visible:ring-primary-400/30';

  return (
    <div className={`space-y-1.5 ${containerClassName}`.trim()}>
      {label ? (
        <label
          htmlFor={inputId}
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
        {leading ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">
            {leading}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={[
            inputBaseClasses,
            borderClasses,
            leading ? 'pl-10' : '',
            trailing ? 'pr-10' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />

        {trailing ? (
          <span className="absolute inset-y-0 right-3 flex items-center text-ink-faint">
            {trailing}
          </span>
        ) : null}
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
});
