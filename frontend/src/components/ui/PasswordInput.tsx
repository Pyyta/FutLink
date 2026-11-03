import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeIcon, EyeOffIcon } from './icons';
import { Input, type InputProps } from './Input';

export type PasswordInputProps = Omit<InputProps, 'type' | 'trailing'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);

    return (
      <Input
        {...props}
        ref={ref}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={
              visible ? t('auth.hidePassword') : t('auth.showPassword')
            }
            aria-pressed={visible}
            className="rounded-full p-1 text-ink-soft transition hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        }
      />
    );
  },
);
