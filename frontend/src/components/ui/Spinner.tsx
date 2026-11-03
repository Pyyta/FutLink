import { LoaderIcon } from './icons';

export interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 20, className = '', label }: SpinnerProps) {
  return (
    <span
      className="inline-flex items-center justify-center"
      role={label ? 'status' : undefined}
      aria-label={label}
    >
      <LoaderIcon
        size={size}
        className={`animate-spin ${className}`.trim()}
      />
    </span>
  );
}
