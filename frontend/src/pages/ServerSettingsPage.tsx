import { useState, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { QRCodeSVG } from 'qrcode.react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import {
  BUILD_API_URL,
  getApiBaseUrl,
  isApiServerConfigured,
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
    // Capacitor's bundled WebView uses a local HTTPS origin; it may still
    // call private-LAN HTTP APIs, which normalizeApiUrl validates separately.
    !Capacitor.isNativePlatform() &&
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    url.startsWith('http://')
  );
}

function getErrorDetail(error: unknown): string | null {
  if (typeof error === 'string') return error.slice(0, 160);
  if (!error || typeof error !== 'object') return null;

  const detail = error as { code?: unknown; message?: unknown };
  return [detail.code, detail.message]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(': ')
    .slice(0, 160) || null;
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
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const requiresSetup = !isApiServerConfigured();

  async function handleScanServer() {
    setError(null);
    setResult(null);
    setScanning(true);

    try {
      const {
        CapacitorBarcodeScanner,
        CapacitorBarcodeScannerAndroidScanningLibrary,
        CapacitorBarcodeScannerTypeHint,
      } = await import('@capacitor/barcode-scanner');
      const { ScanResult } = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        scanInstructions: t('server.scanInstructions'),
        scanButton: false,
        cameraDirection: 1,
        android: {
          scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING,
        },
      });
      const normalized = normalizeApiUrl(ScanResult);

      if (!normalized) {
        setError(t('server.invalidQr'));
        return;
      }

      setValue(normalized);
      setResult({ tone: 'success', message: t('server.scanSuccess') });
    } catch (error) {
      console.error('[FutLink] No se pudo completar el escaneo QR', error);
      const detail = getErrorDetail(error);
      setResult({
        tone: 'error',
        message: detail
          ? `${t('server.scanFailed')} (${detail})`
          : t('server.scanFailed'),
      });
    } finally {
      setScanning(false);
    }
  }

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
    } catch (error) {
      console.error('[FutLink] Falló la prueba de conexión', error);
      const detail = getErrorDetail(error);
      setResult({
        tone: 'error',
        message: detail
          ? `${t('server.testNetworkError')} (${detail})`
          : t('server.testNetworkError'),
      });
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

        {Capacitor.isNativePlatform() ? (
          <Button
            type="button"
            variant="outline"
            fullWidth
            loading={scanning}
            disabled={testing || saving}
            onClick={() => void handleScanServer()}
          >
            {scanning ? t('server.scanning') : t('server.scanAction')}
          </Button>
        ) : null}

        {!Capacitor.isNativePlatform() &&
        !import.meta.env.DEV &&
        !['localhost', '127.0.0.1'].includes(window.location.hostname) ? (
          <section className="rounded-2xl border border-surface-200 bg-white p-4 text-center">
            <h2 className="text-sm font-semibold text-ink">
              {t('server.qrTitle')}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {t('server.qrDescription')}
            </p>
            <div className="mt-3 inline-flex rounded-xl bg-white p-2">
              <QRCodeSVG value={`${window.location.origin}/api`} size={180} />
            </div>
          </section>
        ) : null}

        <dl className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-soft">{t('server.current')}</dt>
            <dd className="truncate font-medium text-ink">
              {getApiBaseUrl() || t('server.notConnected')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-soft">{t('server.builtIn')}</dt>
            <dd className="truncate font-medium text-ink">
              {Capacitor.isNativePlatform() && !import.meta.env.VITE_API_URL
                ? t('server.noDefault')
                : BUILD_API_URL}
            </dd>
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

        {!requiresSetup ? (
          <Button
            type="button"
            variant="ghost"
            fullWidth
            disabled={saving || testing}
            onClick={() => void handleReset()}
          >
            {t('server.resetAction')}
          </Button>
        ) : null}

        {!requiresSetup ? (
          <button
            type="button"
            onClick={() => {
              navigate('/');
            }}
            className="mx-auto block text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            {t('server.backAction')}
          </button>
        ) : null}
      </form>
    </AuthLayout>
  );
}
