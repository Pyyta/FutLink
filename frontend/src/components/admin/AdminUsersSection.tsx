import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../lib/auth/session-context';
import { getErrorMessage } from '../../lib/api/error-message';
import { adminApi } from '../../lib/api/endpoints';
import type {
  AdminConfig,
  AdminUserDetail,
  AdminUserListItem,
  UpdateAdminUserInput,
  UserRole,
  UserState,
} from '../../lib/api/types';
import { formatShortDate } from '../../lib/format';
import { isAppLocale, type AppLocale } from '../../i18n';
import {
  AlertCircleIcon,
  BottomSheet,
  Button,
  Card,
  Input,
  Select,
  Spinner,
  useToast,
} from '../ui';
import { AdminPagination } from './AdminPagination';
import {
  AdminUserForm,
  type AdminUserFormValues,
} from './AdminUserForm';

const PAGE_SIZE = 10;

type StateFilter = '' | UserState;
type RoleFilter = '' | UserRole;

interface Filters {
  search: string;
  state: StateFilter;
  role: RoleFilter;
}

type EditorState = { mode: 'create' } | { mode: 'edit'; id: number };
type ConfirmKind = 'suspend' | 'reactivate' | 'delete';

interface ConfirmTarget {
  kind: ConfirmKind;
  user: AdminUserListItem;
}

type SaveInput =
  | { mode: 'create'; values: AdminUserFormValues }
  | { mode: 'edit'; id: number; values: AdminUserFormValues };

const EMPTY_FILTERS: Filters = { search: '', state: '', role: '' };

const STATE_CLASSES: Record<UserState, string> = {
  active: 'bg-success-50 text-success-700',
  suspended: 'bg-warning-50 text-warning-700',
  deleted: 'bg-surface-sunken text-ink-faint',
};

function useLocale(): AppLocale {
  const { i18n } = useTranslation();
  return isAppLocale(i18n.language) ? i18n.language : 'es-CO';
}

function updatePayload(values: AdminUserFormValues): UpdateAdminUserInput {
  const payload: UpdateAdminUserInput = {
    email: values.email,
    name: values.name,
    phone: values.phone,
    locality: values.locality,
    positionIds: values.positionIds,
    role: values.role,
    state: values.state,
  };

  if (values.password.length > 0) {
    payload.password = values.password;
  }

  return payload;
}

export function AdminUsersSection({ config }: { config: AdminConfig }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useSession();
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['admin-users', filters, page],
    queryFn: () =>
      adminApi.listUsers({
        search: filters.search || undefined,
        state: filters.state || undefined,
        role: filters.role || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  useEffect(() => {
    const data = usersQuery.data;
    if (!data || usersQuery.isFetching || page <= 1) return;
    if (data.users.length === 0 && data.totalPages < page) {
      setPage(Math.max(1, data.totalPages));
    }
  }, [page, usersQuery.data, usersQuery.isFetching]);

  const editingId = editor?.mode === 'edit' ? editor.id : null;
  const detailQuery = useQuery({
    queryKey: ['admin-user', editingId],
    enabled: editingId !== null,
    queryFn: async (): Promise<{ user: AdminUserDetail }> => {
      if (editingId === null) {
        throw new Error('No hay usuario seleccionado');
      }
      return adminApi.getUser(editingId);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (input: SaveInput) => {
      if (input.mode === 'create') {
        return adminApi.createUser({
          email: input.values.email,
          password: input.values.password,
          name: input.values.name,
          phone: input.values.phone,
          locality: input.values.locality,
          positionIds: input.values.positionIds,
          role: input.values.role,
        });
      }

      return adminApi.updateUser(input.id, updatePayload(input.values));
    },
    onSuccess: (_result, input) => {
      show(
        'success',
        t(
          input.mode === 'create'
            ? 'admin.users.created'
            : 'admin.users.updated',
        ),
      );
      setEditor(null);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error) => {
      setFormError(getErrorMessage(error, t));
    },
  });

  const confirmMutation = useMutation<unknown, unknown, ConfirmTarget>({
    mutationFn: (target: ConfirmTarget) => {
      if (target.kind === 'delete') {
        return adminApi.deleteUser(target.user.id);
      }
      return adminApi.updateUser(target.user.id, {
        state: target.kind === 'suspend' ? 'suspended' : 'active',
      });
    },
    onSuccess: (_result, target) => {
      show('success', t(`admin.users.success.${target.kind}`));
      setConfirmTarget(null);
      setConfirmError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error) => {
      setConfirmError(getErrorMessage(error, t));
    },
  });

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters({ ...draft, search: draft.search.trim() });
    setPage(1);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const openEditor = (next: EditorState) => {
    setFormError(null);
    setEditor(next);
  };

  const closeEditor = () => {
    if (saveMutation.isPending) return;
    setEditor(null);
    setFormError(null);
  };

  const openConfirm = (kind: ConfirmKind, user: AdminUserListItem) => {
    setConfirmError(null);
    setConfirmTarget({ kind, user });
  };

  const closeConfirm = () => {
    if (confirmMutation.isPending) return;
    setConfirmTarget(null);
    setConfirmError(null);
  };

  const confirmName =
    confirmTarget?.user.name ?? confirmTarget?.user.email ?? '';
  const confirmAction = confirmTarget?.kind ?? 'suspend';
  const hasFilters =
    filters.search !== '' || filters.state !== '' || filters.role !== '';
  const selfEditing =
    editor?.mode === 'edit' && currentUser?.id === editor.id;

  return (
    <div className="space-y-4">
      <Card padding="md">
        <form className="space-y-3" onSubmit={applyFilters}>
          <Input
            id="admin-users-search"
            label={t('admin.users.searchLabel')}
            placeholder={t('admin.users.searchPlaceholder')}
            value={draft.search}
            onChange={(event) => {
              setDraft((current) => ({ ...current, search: event.target.value }));
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              id="admin-users-state"
              label={t('admin.users.stateFilter')}
              value={draft.state}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  state: event.target.value as StateFilter,
                }));
              }}
            >
              <option value="">{t('admin.users.allStates')}</option>
              <option value="active">{t('admin.users.states.active')}</option>
              <option value="suspended">
                {t('admin.users.states.suspended')}
              </option>
              <option value="deleted">{t('admin.users.states.deleted')}</option>
            </Select>

            <Select
              id="admin-users-role"
              label={t('admin.users.roleFilter')}
              value={draft.role}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  role: event.target.value as RoleFilter,
                }));
              }}
            >
              <option value="">{t('admin.users.allRoles')}</option>
              <option value="user">{t('admin.users.roles.user')}</option>
              <option value="admin">{t('admin.users.roles.admin')}</option>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button type="submit" fullWidth loading={usersQuery.isFetching}>
              {t('admin.users.searchAction')}
            </Button>
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={clearFilters}
            >
              {t('admin.users.clearFilters')}
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-ink-soft">
          {usersQuery.data
            ? t('admin.users.total', { count: usersQuery.data.total })
            : null}
        </p>
        <Button
          size="sm"
          onClick={() => {
            openEditor({ mode: 'create' });
          }}
        >
          {t('admin.users.createAction')}
        </Button>
      </div>

      {usersQuery.isLoading ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        </Card>
      ) : usersQuery.isError ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <AlertCircleIcon size={20} className="text-danger-600" />
            <p className="text-sm font-semibold text-primary-900">
              {getErrorMessage(usersQuery.error, t)}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={usersQuery.isFetching}
            onClick={() => {
              void usersQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : usersQuery.data && usersQuery.data.users.length > 0 ? (
        <>
          <ul className="space-y-3">
            {usersQuery.data.users.map((user) => {
              const isSelf = currentUser?.id === user.id;
              const name = user.name ?? user.email;

              return (
                <li key={user.id}>
                  <Card padding="md" className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-heading text-ink">
                          {name}
                        </h2>
                        {user.name ? (
                          <p className="truncate text-sm text-ink-soft">
                            {user.email}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`inline-flex rounded-pill px-2.5 py-1 text-[11px] font-bold ${STATE_CLASSES[user.state]}`}
                        >
                          {t(`admin.users.states.${user.state}`)}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                          {t(`admin.users.roles.${user.role}`)}
                        </span>
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div>
                        <dt className="text-ink-faint">
                          {t('admin.users.fields.phone')}
                        </dt>
                        <dd className="truncate font-medium text-ink">
                          {user.phone ?? t('admin.users.noPhone')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-faint">
                          {t('admin.users.fields.locality')}
                        </dt>
                        <dd className="truncate font-medium text-ink">
                          {user.locality ?? t('admin.users.noLocality')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-faint">
                          {t('admin.users.matchsPlayed')}
                        </dt>
                        <dd className="font-medium text-ink">
                          {user.matchsPlayed}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-faint">
                          {t('admin.users.createdAt')}
                        </dt>
                        <dd className="font-medium text-ink">
                          {formatShortDate(user.createdAt, locale)}
                        </dd>
                      </div>
                    </dl>

                    {!user.profileCompleted ? (
                      <p className="text-xs font-semibold text-warning-700">
                        {t('admin.users.profileIncomplete')}
                      </p>
                    ) : null}

                    {isSelf ? (
                      <p className="text-xs text-ink-faint">
                        {t('admin.users.selfHint')}
                      </p>
                    ) : null}

                    {user.state !== 'deleted' ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            openEditor({ mode: 'edit', id: user.id });
                          }}
                        >
                          {t('admin.users.editAction')}
                        </Button>

                        {user.state === 'active' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSelf}
                            title={isSelf ? t('admin.users.selfHint') : undefined}
                            onClick={() => {
                              openConfirm('suspend', user);
                            }}
                          >
                            {t('admin.users.suspendAction')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              openConfirm('reactivate', user);
                            }}
                          >
                            {t('admin.users.reactivateAction')}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isSelf}
                          title={isSelf ? t('admin.users.selfHint') : undefined}
                          onClick={() => {
                            openConfirm('delete', user);
                          }}
                        >
                          {t('admin.users.deleteAction')}
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>

          <AdminPagination
            page={usersQuery.data.page}
            totalPages={usersQuery.data.totalPages}
            onChange={setPage}
          />
        </>
      ) : (
        <Card padding="lg">
          <p className="text-sm text-ink-soft">
            {hasFilters
              ? t('admin.users.emptyFiltered')
              : t('admin.users.empty')}
          </p>
        </Card>
      )}

      <BottomSheet
        open={editor !== null}
        onClose={closeEditor}
        title={
          editor?.mode === 'create'
            ? t('admin.users.createTitle')
            : t('admin.users.editTitle')
        }
        {...(selfEditing
          ? { description: t('admin.users.editSelfHint') }
          : {})}
      >
        {editor?.mode === 'create' ? (
          <AdminUserForm
            mode="create"
            config={config}
            submitting={saveMutation.isPending}
            error={formError}
            onSubmit={(values) => {
              saveMutation.mutate({ mode: 'create', values });
            }}
            onCancel={closeEditor}
          />
        ) : detailQuery.isLoading ? (
          <div className="flex items-center gap-3 py-6 text-sm font-medium text-ink-soft">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        ) : detailQuery.isError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm font-medium text-danger-600">
              {getErrorMessage(detailQuery.error, t)}
            </p>
            <Button
              variant="outline"
              fullWidth
              loading={detailQuery.isFetching}
              onClick={() => {
                void detailQuery.refetch();
              }}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : detailQuery.data ? (
          <AdminUserForm
            key={detailQuery.data.user.id}
            mode="edit"
            config={config}
            initial={detailQuery.data.user}
            submitting={saveMutation.isPending}
            error={formError}
            onSubmit={(values) => {
              if (editor?.mode !== 'edit') return;
              saveMutation.mutate({
                mode: 'edit',
                id: editor.id,
                values,
              });
            }}
            onCancel={closeEditor}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={confirmTarget !== null}
        onClose={closeConfirm}
        title={t(`admin.users.confirm.${confirmAction}Title`)}
        description={t(`admin.users.confirm.${confirmAction}Body`, {
          name: confirmName,
        })}
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              disabled={confirmMutation.isPending}
              onClick={closeConfirm}
            >
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              variant={confirmAction === 'reactivate' ? 'primary' : 'danger'}
              loading={confirmMutation.isPending}
              onClick={() => {
                if (confirmTarget) confirmMutation.mutate(confirmTarget);
              }}
            >
              {t('admin.users.confirm.action')}
            </Button>
          </div>
        }
      >
        {confirmError ? (
          <p role="alert" className="text-sm font-medium text-danger-600">
            {confirmError}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            {t(`admin.users.confirm.${confirmAction}Hint`)}
          </p>
        )}
      </BottomSheet>
    </div>
  );
}
