import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../lib/api/error-message';
import { adminApi } from '../../lib/api/endpoints';
import type { AdminConfig } from '../../lib/api/types';
import {
  BottomSheet,
  Button,
  Card,
  FormError,
  Input,
  Spinner,
  useToast,
} from '../ui';

type CatalogKind = 'position' | 'locality';

type CatalogEditor =
  | { kind: CatalogKind; mode: 'create' }
  | { kind: CatalogKind; mode: 'edit'; id: number };

interface CatalogSave {
  kind: CatalogKind;
  id: number | null;
  value: string;
}

interface CatalogDeleteTarget {
  kind: CatalogKind;
  id: number;
  name: string;
}

export function AdminConfigSection({ config }: { config: AdminConfig }) {
  const { t } = useTranslation();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [minScore, setMinScore] = useState(() =>
    String(config.ratings.minScore),
  );
  const [maxScore, setMaxScore] = useState(() =>
    String(config.ratings.maxScore),
  );
  const [requireAccepted, setRequireAccepted] = useState(
    config.ratings.requireAcceptedRequest,
  );
  const [ratingsError, setRatingsError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null,
  );
  const [editor, setEditor] = useState<CatalogEditor | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogDeleteTarget | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setMinScore(String(config.ratings.minScore));
    setMaxScore(String(config.ratings.maxScore));
    setRequireAccepted(config.ratings.requireAcceptedRequest);
  }, [
    config.ratings.minScore,
    config.ratings.maxScore,
    config.ratings.requireAcceptedRequest,
  ]);

  const invalidateConfig = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-config'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog'] });
  };

  const ratingsMutation = useMutation({
    mutationFn: () =>
      adminApi.updateRatings({
        minScore: Number(minScore),
        maxScore: Number(maxScore),
        requireAcceptedRequest: requireAccepted,
      }),
    onSuccess: () => {
      show('success', t('admin.config.ratingsSaved'));
      setRatingsError(null);
      invalidateConfig();
    },
    onError: (error) => {
      setRatingsError(getErrorMessage(error, t));
    },
  });

  const notificationsMutation = useMutation({
    mutationFn: (enabled: boolean) => adminApi.updateNotifications(enabled),
    onSuccess: () => {
      show('success', t('admin.config.notificationsSaved'));
      setNotificationsError(null);
      invalidateConfig();
    },
    onError: (error) => {
      setNotificationsError(getErrorMessage(error, t));
    },
  });

  const catalogSaveMutation = useMutation<unknown, unknown, CatalogSave>({
    mutationFn: (input: CatalogSave) => {
      if (input.kind === 'position') {
        return input.id === null
          ? adminApi.createPosition(input.value)
          : adminApi.updatePosition(input.id, input.value);
      }

      return input.id === null
        ? adminApi.createLocality(input.value)
        : adminApi.updateLocality(input.id, input.value);
    },
    onSuccess: (_result, input) => {
      show(
        'success',
        t(
          input.id === null ? 'admin.config.created' : 'admin.config.updated',
        ),
      );
      setEditor(null);
      setEditorError(null);
      invalidateConfig();
    },
    onError: (error) => {
      setEditorError(getErrorMessage(error, t));
    },
  });

  const catalogDeleteMutation = useMutation({
    mutationFn: (target: CatalogDeleteTarget) =>
      target.kind === 'position'
        ? adminApi.deletePosition(target.id)
        : adminApi.deleteLocality(target.id),
    onSuccess: () => {
      show('success', t('admin.config.deleted'));
      setDeleteTarget(null);
      setDeleteError(null);
      invalidateConfig();
    },
    onError: (error) => {
      setDeleteError(getErrorMessage(error, t));
    },
  });

  const saveRatings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const min = Number(minScore);
    const max = Number(maxScore);

    if (!Number.isInteger(min) || min < 1 || min > 10) {
      setRatingsError(t('admin.config.validation.minScore'));
      return;
    }
    if (!Number.isInteger(max) || max < 1 || max > 10) {
      setRatingsError(t('admin.config.validation.maxScore'));
      return;
    }
    if (min > max) {
      setRatingsError(t('admin.config.validation.scaleOrder'));
      return;
    }

    setRatingsError(null);
    ratingsMutation.mutate();
  };

  const openCreate = (kind: CatalogKind) => {
    setEditorValue('');
    setEditorError(null);
    setEditor({ kind, mode: 'create' });
  };

  const openEdit = (kind: CatalogKind, id: number, value: string) => {
    setEditorValue(value);
    setEditorError(null);
    setEditor({ kind, mode: 'edit', id });
  };

  const closeEditor = () => {
    if (catalogSaveMutation.isPending) return;
    setEditor(null);
    setEditorError(null);
  };

  const submitCatalog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editorValue.trim().length < 2) {
      setEditorError(t('admin.config.validation.nameMin'));
      return;
    }
    if (!editor) return;

    setEditorError(null);
    catalogSaveMutation.mutate({
      kind: editor.kind,
      id: editor.mode === 'edit' ? editor.id : null,
      value: editorValue.trim(),
    });
  };

  const openDelete = (kind: CatalogKind, id: number, name: string) => {
    setDeleteError(null);
    setDeleteTarget({ kind, id, name });
  };

  const closeDelete = () => {
    if (catalogDeleteMutation.isPending) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const editorTitle = editor
    ? t(
        editor.kind === 'position'
          ? editor.mode === 'create'
            ? 'admin.config.createPositionTitle'
            : 'admin.config.editPositionTitle'
          : editor.mode === 'create'
            ? 'admin.config.createLocalityTitle'
            : 'admin.config.editLocalityTitle',
      )
    : '';

  const deleteTitle = deleteTarget
    ? t(
        deleteTarget.kind === 'position'
          ? 'admin.config.deletePositionTitle'
          : 'admin.config.deleteLocalityTitle',
      )
    : '';
  const deleteBody = deleteTarget
    ? t(
        deleteTarget.kind === 'position'
          ? 'admin.config.deletePositionBody'
          : 'admin.config.deleteLocalityBody',
        { name: deleteTarget.name },
      )
    : '';

  return (
    <div className="space-y-4">
      <Card padding="lg" className="space-y-4">
        <div>
          <h2 className="text-heading text-ink">
            {t('admin.config.ratingsTitle')}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {t('admin.config.ratingsBody')}
          </p>
        </div>

        <form className="space-y-3" onSubmit={saveRatings}>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="admin-config-min-score"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              label={t('admin.config.minScore')}
              value={minScore}
              required
              onChange={(event) => setMinScore(event.target.value)}
            />

            <Input
              id="admin-config-max-score"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              label={t('admin.config.maxScore')}
              value={maxScore}
              required
              onChange={(event) => setMaxScore(event.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 rounded-control bg-surface-sunken p-3">
            <input
              type="checkbox"
              checked={requireAccepted}
              onChange={(event) => setRequireAccepted(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary-600"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                {t('admin.config.requireAccepted')}
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {t('admin.config.requireAcceptedHint')}
              </span>
            </span>
          </label>

          <FormError>{ratingsError}</FormError>

          <Button type="submit" fullWidth loading={ratingsMutation.isPending}>
            {t('admin.config.saveRatings')}
          </Button>
        </form>
      </Card>

      <Card padding="lg" className="space-y-3">
        <div>
          <h2 className="text-heading text-ink">
            {t('admin.config.notificationsTitle')}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {t('admin.config.notificationsBody')}
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-control bg-surface-sunken p-3">
          <input
            type="checkbox"
            checked={config.notifications.enabled}
            disabled={notificationsMutation.isPending}
            onChange={(event) => {
              notificationsMutation.mutate(event.target.checked);
            }}
            className="mt-0.5 h-4 w-4 accent-primary-600"
          />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-ink">
              {t('admin.config.notificationsEnabled')}
            </span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              {t('admin.config.notificationsHint')}
            </span>
          </span>
          {notificationsMutation.isPending ? <Spinner size={16} /> : null}
        </label>

        <FormError>{notificationsError}</FormError>
      </Card>

      <Card padding="lg" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-heading text-ink">
              {t('admin.config.positionsTitle')}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {t('admin.config.positionsBody')}
            </p>
          </div>
          <Button size="sm" onClick={() => openCreate('position')}>
            {t('admin.config.addPosition')}
          </Button>
        </div>

        {config.positions.length === 0 ? (
          <p className="text-sm text-ink-soft">
            {t('admin.config.emptyPositions')}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {config.positions.map((position) => (
              <li
                key={position.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="truncate text-sm font-semibold capitalize text-ink">
                  {position.title}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      openEdit('position', position.id, position.title);
                    }}
                  >
                    {t('admin.config.editAction')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-600 hover:text-danger-700"
                    onClick={() => {
                      openDelete('position', position.id, position.title);
                    }}
                  >
                    {t('admin.config.deleteAction')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="lg" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-heading text-ink">
              {t('admin.config.localitiesTitle')}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {t('admin.config.localitiesBody')}
            </p>
          </div>
          <Button size="sm" onClick={() => openCreate('locality')}>
            {t('admin.config.addLocality')}
          </Button>
        </div>

        {config.localities.length === 0 ? (
          <p className="text-sm text-ink-soft">
            {t('admin.config.emptyLocalities')}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {config.localities.map((locality) => (
              <li
                key={locality.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="truncate text-sm font-semibold text-ink">
                  {locality.name}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      openEdit('locality', locality.id, locality.name);
                    }}
                  >
                    {t('admin.config.editAction')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-600 hover:text-danger-700"
                    onClick={() => {
                      openDelete('locality', locality.id, locality.name);
                    }}
                  >
                    {t('admin.config.deleteAction')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <BottomSheet
        open={editor !== null}
        onClose={closeEditor}
        title={editorTitle}
      >
        <form className="space-y-4" onSubmit={submitCatalog} noValidate>
          <Input
            id="admin-catalog-name"
            label={t(
              editor?.kind === 'position'
                ? 'admin.config.positionName'
                : 'admin.config.localityName',
            )}
            value={editorValue}
            autoFocus
            required
            onChange={(event) => setEditorValue(event.target.value)}
          />

          <FormError>{editorError}</FormError>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              fullWidth
              disabled={catalogSaveMutation.isPending}
              onClick={closeEditor}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              fullWidth
              loading={catalogSaveMutation.isPending}
            >
              {t('admin.config.saveAction')}
            </Button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={deleteTarget !== null}
        onClose={closeDelete}
        title={deleteTitle}
        description={deleteBody}
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              disabled={catalogDeleteMutation.isPending}
              onClick={closeDelete}
            >
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              variant="danger"
              loading={catalogDeleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) catalogDeleteMutation.mutate(deleteTarget);
              }}
            >
              {t('admin.config.confirmDelete')}
            </Button>
          </div>
        }
      >
        {deleteError ? (
          <p role="alert" className="text-sm font-medium text-danger-600">
            {deleteError}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            {t('admin.config.usedHint')}
          </p>
        )}
      </BottomSheet>
    </div>
  );
}
