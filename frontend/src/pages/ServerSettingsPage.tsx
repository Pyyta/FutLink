import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import {
  BUILD_API_URL,
  getApiBaseUrl,
  normalizeApiUrl,
  resetApiUrl,
  setApiUrl,
} from '../lib/api/server-config';
import { useSession } from '../lib/auth/session-context';
import { AuthLayout } from './AuthLayout';

interface TestResult {
  tone: 'success' | 'error';
  message: string;
}

interface HealthPayload {
  status?: unknown;
  db?: unknown;
}

function isBlockedMixedContent(url: string): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    url.startsWith('http://')
  );
}

export function ServerSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { signOut } = useSession();

  const [value, setValue] = useState(() => getApiBaseUrl());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleTest() {
    const normalized = normalizeApiUrl(value);

    if (!normalized) {
      setError(t('server.invalidUrl'));
      setResult(null);
      return;
    }

    if (isBlockedMixedContent(normalized)) {
      setError(t('server.mixedContent'));
      setResult(null);
      return;
    }

    setError(null);
    setResult(null);
    setTesting(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 8000);

    try {
      const response = await fetch(`${normalized}/health`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        setResult({
          tone: 'error',
          message: t('server.testHttpError', { status: response.status }),
        });
        return;
      }

      const payload = (await response
        .json()
        .catch(() => null)) as HealthPayload | null;

      setResult({
        tone: 'success',
        message:
          payload?.db === 'up' ? t('server.testOk') : t('server.testDbDown'),
      });
    } catch {
      setResult({ tone: 'error', message: t('server.testNetworkError') });
    } finally {
      window.clearTimeout(timeoutId);
      setTesting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = normalizeApiUrl(value);

    if (!normalized) {
      setError(t('server.invalidUrl'));
      return;
    }

    if (isBlockedMixedContent(normalized)) {
      setError(t('server.mixedContent'));
      return;
    }

    if (normalized === getApiBaseUrl()) {
      navigate('/', { replace: true });
      return;
    }

    setError(null);
    setSaving(true);

    try {
      // La sesión anterior pertenece al servidor actual; se cierra antes de cambiar.
      await signOut();
      setApiUrl(normalized);
      queryClient.clear();
      toast.success(t('server.saved'));
      navigate('/login', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (getApiBaseUrl() === BUILD_API_URL) {
      navigate('/', { replace: true });
      return;
    }

    setSaving(true);

    try {
      await signOut();
      resetApiUrl();
      queryClient.clear();
      toast.success(t('server.resetDone'));
      navigate('/login', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthLayout title={t('server.title')} subtitle={t('server.subtitle')}>
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Input
          label={t('server.urlLabel')}
          hint={t('server.urlHelp')}
          error={error ?? undefined}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
            setResult(null);
          }}
          placeholder={t('server.urlPlaceholder')}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        <dl className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-soft">{t('server.current')}</dt>
            <dd className="truncate font-medium text-ink">{getApiBaseUrl()}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-soft">{t('server.builtIn')}</dt>
            <dd className="truncate font-medium text-ink">{BUILD_API_URL}</dd>
          </div>
        </dl>

        <Button
          type="button"
          variant="outline"
          fullWidth
          loading={testing}
          onClick={() => void handleTest()}
        >
          {testing ? t('server.testing') : t('server.testAction')}
        </Button>

        {result ? (
          <p
            role="status"
            className={
              result.tone === 'success'
                ? 'text-sm font-medium text-success-600'
                : 'text-sm font-medium text-danger-600'
            }
          >
            {result.message}
          </p>
        ) : null}

        <Button type="submit" fullWidth loading={saving}>
          {t('server.saveAction')}
        </Button>

        <Button
          type="button"
          variant="ghost"
          fullWidth
          disabled={saving || testing}
          onClick={() => void handleReset()}
        >
          {t('server.resetAction')}
        </Button>

        <button
          type="button"
          onClick={() => {
            navigate('/');
          }}
          className="mx-auto block text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          {t('server.backAction')}
        </button>
      </form>
    </AuthLayout>
  );
}
